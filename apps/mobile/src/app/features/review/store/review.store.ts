import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { ReviewRating, ScheduledCard } from '@lingua-card/shared/domain';
import { AuthService } from '../../../core/services/auth.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { SyncService } from '../../../core/services/sync.service';
import { CardStore } from '../../vault/store/card.store';
import {
  createReviewSession, PromptDirection, recordPresentation, recordSessionReview,
  resolvePresentation, ReviewPresentation, ReviewSessionSource, ReviewSessionState,
  resolveManuallyMasteredCard, selectNextCard, skipSessionCard,
} from '../domain/review-domain';
import {
  deserializeReviewSessionState,
  deserializeReviewCommittedEvent,
  PendingReviewCommit,
  schedulingStateFor,
  serializeReviewSessionState,
} from '../domain/review-persistence';
import { StartSessionResult } from '../domain/session-builder';
import { MAX_SESSION_HISTORY, ReviewSessionHistoryEntry, SyncOperationType } from '../models/review.model';
import {
  applyCurrentReviewPreferences,
  ReviewPrefsService,
  toPromptDirection,
  toReviewMode,
} from '../services/review-prefs.service';
import { ReviewSessionBuilderService } from '../services/review-session-builder.service';
import { UpsertSessionDto } from '../services/review-session-api.service';
import { ReviewCommitService } from '../services/review-commit.service';
import { ReviewLocalRepository } from '../services/review-local.repository';
import { EngagementStore } from '../../engagement/state/engagement.store';
import { CardAdministrationService } from '../services/card-administration.service';

export interface ReviewCommitContext {
  reviewMode?: 'typing' | 'recall';
  promptDirection?: PromptDirection;
  responseType?: 'self_rated' | 'typed_answer' | 'dont_know';
  answerEvaluation?: import('../domain/review-domain').AnswerEvaluation;
}

export type ReviewOperation =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'ready' }
  | { kind: 'committing' }
  | { kind: 'administering'; action: 'manual_mastery' }
  | { kind: 'completed' }
  | { kind: 'error'; message: string; recoverable: boolean };

interface ReviewState {
  session: ReviewSessionState | null;
  presentation: ReviewPresentation | null;
  operation: ReviewOperation;
  sessionRatings: Readonly<Record<string, ReviewRating>>;
  sessionNewCardCount: number;
  completedSession: ReviewSessionHistoryEntry | null;
  sessionHistory: ReviewSessionHistoryEntry[];
  commitError: string | null;
  committedEvents: PendingReviewCommit['event'][];
  lastReviewedCardId: string | null;
}

type PersistedSessionHistoryEntry = Omit<ReviewSessionHistoryEntry, 'originalCardIds'> & {
  originalCardIds?: readonly string[];
  manuallyMasteredCardIds?: readonly string[];
};

const initialState: ReviewState = {
  session: null, presentation: null, operation: { kind: 'idle' }, sessionRatings: {},
  sessionNewCardCount: 0, completedSession: null, sessionHistory: [], commitError: null,
  committedEvents: [],
  lastReviewedCardId: null,
};
function isReviewRating(value: unknown): value is ReviewRating {
  return value === 'again' || value === 'hard' || value === 'good' || value === 'easy';
}

function isPersistedSessionHistoryEntry(value: unknown): value is PersistedSessionHistoryEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  if (!('id' in value) || typeof value.id !== 'string') return false;
  if (!('startedAt' in value) || typeof value.startedAt !== 'string') return false;
  if (!('completedAt' in value) || typeof value.completedAt !== 'string') return false;
  if (!('totalCards' in value) || typeof value.totalCards !== 'number') return false;
  if (!('newCards' in value) || typeof value.newCards !== 'number') return false;
  if (!('reviewedCardIds' in value) || !Array.isArray(value.reviewedCardIds) || !value.reviewedCardIds.every(id => typeof id === 'string')) return false;
  if ('originalCardIds' in value && (!Array.isArray(value.originalCardIds) || !value.originalCardIds.every(id => typeof id === 'string'))) return false;
  if ('manuallyMasteredCardIds' in value && (!Array.isArray(value.manuallyMasteredCardIds) || !value.manuallyMasteredCardIds.every(id => typeof id === 'string'))) return false;
  if (!('ratings' in value) || typeof value.ratings !== 'object' || value.ratings === null || Array.isArray(value.ratings)) return false;
  return Object.values(value.ratings).every(isReviewRating);
}

function isCommittedReviewEvent(value: unknown): value is PendingReviewCommit['event'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return 'type' in value && value.type === 'ReviewCommitted'
    && 'schemaVersion' in value && value.schemaVersion === 1
    && 'eventId' in value && typeof value.eventId === 'string'
    && 'cardId' in value && typeof value.cardId === 'string'
    && 'reviewedAt' in value && typeof value.reviewedAt === 'string'
    && 'rating' in value && isReviewRating(value.rating);
}

export const ReviewStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(store => ({
    isCommitting: computed(() => store.operation().kind === 'committing'),
    isBusy: computed(() => store.operation().kind === 'committing' || store.operation().kind === 'administering'),
    completedOriginalCount: computed(() => store.session()?.completedOriginalCardIds.length ?? 0),
    resolvedOriginalCount: computed(() => {
      const session = store.session();
      return session ? session.completedOriginalCardIds.length + session.manuallyMasteredCardIds.length : 0;
    }),
    totalOriginalCount: computed(() => store.session()?.definition.originalCardIds.length ?? 0),
    resumableSessionId: computed(() => {
      const session = store.session();
      return session?.status === 'active' ? session.definition.id : null;
    }),
  })),
  withMethods(store => {
    const cardStore = inject(CardStore);
    const localData = inject(LocalDataService);
    const authService = inject(AuthService);
    const syncService = inject(SyncService);
    const sessionBuilder = inject(ReviewSessionBuilderService);
    const reviewPrefs = inject(ReviewPrefsService);
    const reviewCommit = inject(ReviewCommitService);
    const reviewLocal = inject(ReviewLocalRepository);
    const engagementStore = inject(EngagementStore);
    const cardAdministration = inject(CardAdministrationService);
    let persistenceChain: Promise<void> = Promise.resolve();

    function serializePersistence(work: () => Promise<void>): Promise<void> {
      const current = persistenceChain.then(work);
      persistenceChain = current.catch(() => undefined);
      return current;
    }
    function cardById(cardId: string): ScheduledCard | undefined {
      return cardStore.cards().find(card => card.id === cardId);
    }
    function schedulingStates(): Map<string, ReturnType<typeof schedulingStateFor>> {
      return new Map(cardStore.cards().map(card => [card.id, schedulingStateFor(card)]));
    }
    async function persistActiveSession(
      session: ReviewSessionState,
      ratings: Readonly<Record<string, ReviewRating>> = store.sessionRatings(),
      newCardCount: number = store.sessionNewCardCount(),
    ): Promise<void> {
      const userId = authService.currentUser()?.id;
      if (!userId) throw new Error('A signed-in user is required to save a review session');
      await localData.setActiveReviewSession(userId, {
        session: serializeReviewSessionState(session),
        ratings,
        newCardCount,
      });
    }
    async function clearPersistedActiveSession(): Promise<void> {
      const userId = authService.currentUser()?.id;
      if (userId) await localData.clearActiveReviewSession(userId);
    }
    async function persistHistory(sessions: ReviewSessionHistoryEntry[]): Promise<void> {
      const userId = authService.currentUser()?.id;
      if (!userId) return;
      await localData.setSessionHistory(userId, sessions);
    }
    function toUpsertDto(session: ReviewSessionHistoryEntry): UpsertSessionDto {
      return {
        id: session.id, collectionId: session.collectionId, collectionName: session.collectionName,
        startedAt: session.startedAt, completedAt: session.completedAt, totalCards: session.totalCards,
        reviewedCards: Object.keys(session.ratings).length, newCards: session.newCards, ratings: session.ratings,
      };
    }
    async function bufferSession(session: ReviewSessionHistoryEntry): Promise<void> {
      const userId = authService.currentUser()?.id;
      if (!userId) return;
      const existing = await localData.getPendingSessions(userId);
      await localData.setPendingSessions(userId, [
        ...existing.filter(candidate => candidate.id !== session.id), toUpsertDto(session),
      ]);
    }
    function projectCompletedSession(session: ReviewSessionState): ReviewSessionHistoryEntry {
      const ratings = store.sessionRatings();
      return {
        id: session.definition.id,
        startedAt: session.definition.startedAt.toISOString(),
        completedAt: session.completedAt?.toISOString() ?? new Date().toISOString(),
        totalCards: session.definition.originalCardIds.length,
        newCards: store.sessionNewCardCount(), ratings,
        collectionId: session.definition.source.kind === 'collection' ? session.definition.source.collectionId : null,
        collectionName: null,
        originalCardIds: [...session.definition.originalCardIds],
        reviewedCardIds: Object.keys(ratings),
        manuallyMasteredCardIds: [...session.manuallyMasteredCardIds],
      };
    }
    async function completeActiveSession(session: ReviewSessionState): Promise<void> {
      const completed = projectCompletedSession(session);
      const updated = [completed, ...store.sessionHistory()].slice(0, MAX_SESSION_HISTORY);
      try {
        await clearPersistedActiveSession();
      } catch {
        patchState(store, { commitError: 'Completed session cleanup will be retried.' });
      }
      patchState(store, {
        session, presentation: null, operation: { kind: 'completed' },
        completedSession: completed, sessionHistory: updated,
      });
      void persistHistory(updated).catch(() => patchState(store, { commitError: 'Session history could not be saved on this device.' }));
      void serializePersistence(() => bufferSession(completed)).catch(() => patchState(store, { commitError: 'Session synchronization could not be queued.' }));
      void serializePersistence(async () => {
        const userId = authService.currentUser()?.id;
        if (!userId) return;
        await syncService.enqueue({ type: SyncOperationType.FLUSH_REVIEW_COMMITS, payload: { userId } });
        await syncService.enqueue({ type: SyncOperationType.FLUSH_REVIEW_SESSIONS, payload: { userId } });
        if (navigator.onLine) void syncService.processQueue();
      }).catch(() => patchState(store, { commitError: 'Session synchronization could not be queued.' }));
    }
    async function presentNextCard(session: ReviewSessionState, now: Date): Promise<void> {
      const selection = selectNextCard(session, schedulingStates(), now);
      if (selection.kind === 'complete') {
        await completeActiveSession(selection.state);
        return;
      }
      const nextSession = recordPresentation(session, selection);
      await persistActiveSession(nextSession);
      patchState(store, {
        session: nextSession, presentation: resolvePresentation(nextSession, selection), operation: { kind: 'ready' },
      });
    }
    async function commitCardReview(
      card: ScheduledCard, sessionId: string, rating: ReviewRating, context: ReviewCommitContext,
    ): Promise<PendingReviewCommit | null> {
      const userId = authService.currentUser()?.id;
      if (!userId) return null;
      try {
        const pendingCommit = await reviewCommit.commit({
          userId,
          card,
          sessionId,
          rating,
          reviewMode: context.reviewMode ?? 'recall',
          promptDirection: context.promptDirection ?? 'source_to_target',
          responseType: context.responseType ?? 'self_rated',
          answerEvaluation: context.answerEvaluation,
        });
        cardStore.updateCard({ ...card, reviewState: pendingCommit.nextState });
        patchState(store, { committedEvents: [...store.committedEvents(), pendingCommit.event] });
        try {
          await syncService.enqueue({ type: SyncOperationType.FLUSH_REVIEW_COMMITS, payload: { userId } });
        } catch {
          patchState(store, { commitError: 'Review saved locally. Synchronization will be retried.' });
        }
        return pendingCommit;
      } catch {
        patchState(store, {
          operation: { kind: 'error', message: 'Unable to save this review on this device.', recoverable: true },
          commitError: 'Unable to save this review on this device.',
        });
        return null;
      }
    }

    return {
      async loadHistory(): Promise<void> {
        const userId = authService.currentUser()?.id;
        if (!userId) return;
        const sessions: ReviewSessionHistoryEntry[] = (await localData.getSessionHistory(userId))
          .filter(isPersistedSessionHistoryEntry)
          .map(session => ({
            ...session,
            originalCardIds: session.originalCardIds ?? session.reviewedCardIds,
            manuallyMasteredCardIds: session.manuallyMasteredCardIds ?? [],
          }));
        const committedEvents = (await reviewLocal.committedEvents(userId)).filter(isCommittedReviewEvent);
        patchState(store, { sessionHistory: sessions, committedEvents });
        if ((await reviewLocal.pendingCommits(userId)).length > 0) {
          await syncService.enqueue({ type: SyncOperationType.FLUSH_REVIEW_COMMITS, payload: { userId } });
        }
        if ((await reviewLocal.pendingAdministrations(userId)).length > 0) {
          await syncService.enqueue({ type: SyncOperationType.FLUSH_CARD_ADMINISTRATIONS, payload: { userId } });
        }
      },
      async startSession(source: ReviewSessionSource, limit: number): Promise<StartSessionResult> {
        patchState(store, {
          session: null, presentation: null, operation: { kind: 'starting' }, sessionRatings: {},
          sessionNewCardCount: 0, completedSession: null, commitError: null, lastReviewedCardId: null,
        });
        const request = {
          source, limit, mode: toReviewMode(reviewPrefs.mode()), direction: toPromptDirection(reviewPrefs.dir()),
        };
        const result = await sessionBuilder.start(request, new Date(), crypto.randomUUID());
        if (result.kind !== 'started') {
          patchState(store, {
            operation: result.kind === 'load_failed'
              ? { kind: 'error', message: 'Cards could not be loaded for review.', recoverable: true }
              : { kind: 'idle' },
          });
          return result;
        }
        const cards = new Map(cardStore.cards().map(card => [card.id, card]));
        patchState(store, {
          session: result.session,
          sessionNewCardCount: result.session.definition.originalCardIds.filter(cardId => cards.get(cardId)?.reviewState.stage === 'new').length,
        });
        try {
          await presentNextCard(result.session, new Date());
        } catch {
          patchState(store, {
            session: result.session,
            presentation: null,
            operation: { kind: 'error', message: 'The review session could not be saved on this device.', recoverable: true },
          });
          return {
            kind: 'load_failed',
            error: { code: 'session_persistence_failed', message: 'The review session could not be saved on this device.' },
          };
        }
        return result;
      },
      async startSessionForCards(source: ReviewSessionSource, cardIds: readonly string[]): Promise<StartSessionResult> {
        patchState(store, {
          session: null, presentation: null, operation: { kind: 'starting' }, sessionRatings: {},
          sessionNewCardCount: 0, completedSession: null, commitError: null, lastReviewedCardId: null,
        });
        const availableCards = new Map(cardStore.cards().map(card => [card.id, card]));
        const originalCardIds = [...new Set(cardIds)].filter(cardId => availableCards.has(cardId));
        if (originalCardIds.length === 0) {
          patchState(store, { operation: { kind: 'idle' } });
          return availableCards.size === 0 ? { kind: 'empty_library' } : { kind: 'source_matched_nothing' };
        }
        const session = createReviewSession({
          id: crypto.randomUUID(), source,
          mode: toReviewMode(reviewPrefs.mode()), direction: toPromptDirection(reviewPrefs.dir()),
          originalCardIds, startedAt: new Date(),
        });
        patchState(store, {
          session,
          sessionNewCardCount: originalCardIds.filter(cardId => availableCards.get(cardId)?.reviewState.stage === 'new').length,
        });
        try {
          await presentNextCard(session, new Date());
          return { kind: 'started', session };
        } catch {
          patchState(store, {
            session, presentation: null,
            operation: { kind: 'error', message: 'The review session could not be saved on this device.', recoverable: true },
          });
          return {
            kind: 'load_failed',
            error: { code: 'session_persistence_failed', message: 'The review session could not be saved on this device.' },
          };
        }
      },
      async resumeSession(sessionId: string): Promise<boolean> {
        const userId = authService.currentUser()?.id;
        if (!userId) return false;
        const persisted = await localData.getActiveReviewSession(userId);
        if (!persisted || persisted.session.definition.id !== sessionId) return false;
        const persistedSession = deserializeReviewSessionState(persisted.session);
        if (persistedSession.status !== 'active') {
          await localData.clearActiveReviewSession(userId);
          return false;
        }
        const session = applyCurrentReviewPreferences(persistedSession, {
          mode: reviewPrefs.mode(),
          direction: reviewPrefs.dir(),
        });
        patchState(store, {
          session,
          presentation: null,
          operation: { kind: 'starting' },
          sessionRatings: persisted.ratings,
          sessionNewCardCount: persisted.newCardCount,
          completedSession: null,
          commitError: null,
        });
        try {
          await presentNextCard(session, new Date());
          return true;
        } catch {
          patchState(store, {
            operation: { kind: 'error', message: 'The review session could not be resumed.', recoverable: true },
          });
          return false;
        }
      },
      async commitCurrentRating(rating: ReviewRating, context: ReviewCommitContext = {}): Promise<boolean> {
        if (store.isCommitting()) return false;
        const session = store.session();
        const presentation = store.presentation();
        if (!session || !presentation || session.status !== 'active') return false;
        const currentCard = cardById(presentation.cardId);
        if (!currentCard) {
          patchState(store, { operation: { kind: 'error', message: 'The current review card is unavailable.', recoverable: false } });
          return false;
        }
        patchState(store, { operation: { kind: 'committing' }, commitError: null });
        const pendingCommit = await commitCardReview(currentCard, session.definition.id, rating, {
          ...context, reviewMode: session.definition.mode, promptDirection: presentation.direction,
        });
        if (!pendingCommit) return false;
        const reviewedSession = recordSessionReview(session, presentation.cardId, presentation.kind);
        const ratings = { ...store.sessionRatings(), [presentation.cardId]: rating };
        patchState(store, {
          session: reviewedSession,
          sessionRatings: ratings,
          lastReviewedCardId: presentation.cardId,
        });
        const nextSelection = selectNextCard(reviewedSession, schedulingStates(), new Date());
        try {
          await engagementStore.projectCommittedReview(
            deserializeReviewCommittedEvent(pendingCommit.event),
            nextSelection.kind === 'complete',
          );
        } catch {
          patchState(store, { commitError: 'Review saved. Engagement progress will be retried.' });
        }
        try {
          await persistActiveSession(reviewedSession, ratings);
          await presentNextCard(reviewedSession, new Date());
        } catch {
          patchState(store, {
            operation: { kind: 'error', message: 'Review saved, but session progress could not be saved.', recoverable: true },
          });
          return false;
        }
        return true;
      },
      async skipCurrentCard(): Promise<boolean> {
        if (store.operation().kind !== 'ready') return false;
        const session = store.session();
        const presentation = store.presentation();
        if (!session || !presentation) return false;
        const skipped = skipSessionCard(session, presentation.cardId, presentation.kind);
        try {
          await persistActiveSession(skipped);
          patchState(store, { session: skipped, presentation: null });
          await presentNextCard(skipped, new Date());
        } catch {
          patchState(store, {
            operation: { kind: 'error', message: 'The skipped card could not be saved.', recoverable: true },
          });
          return false;
        }
        return true;
      },
      async masterCurrentCard(): Promise<boolean> {
        if (store.isBusy()) return false;
        const session = store.session();
        const presentation = store.presentation();
        if (!session || !presentation) return false;
        const card = cardById(presentation.cardId);
        if (!card) {
          patchState(store, { operation: { kind: 'error', message: 'The current review card is unavailable.', recoverable: false } });
          return false;
        }
        patchState(store, { operation: { kind: 'administering', action: 'manual_mastery' }, commitError: null });
        try {
          await cardAdministration.manuallyMaster(card);
        } catch {
          patchState(store, {
            operation: { kind: 'error', message: 'This card could not be marked as mastered. Check your connection and try again.', recoverable: true },
            commitError: 'Manual mastery could not be saved.',
          });
          return false;
        }
        const resolved = resolveManuallyMasteredCard(session, presentation.cardId, presentation.kind);
        try {
          await persistActiveSession(resolved);
          patchState(store, { session: resolved, presentation: null });
          await presentNextCard(resolved, new Date());
        } catch {
          const selection = selectNextCard(resolved, schedulingStates(), new Date());
          if (selection.kind === 'complete') {
            await completeActiveSession(selection.state);
          } else {
            const nextSession = recordPresentation(resolved, selection);
            patchState(store, {
              session: nextSession,
              presentation: resolvePresentation(nextSession, selection),
              operation: { kind: 'ready' },
              commitError: 'Card mastered, but session progress could not be saved on this device.',
            });
          }
        }
        return true;
      },
      leaveSession(): void {
        if (store.session()?.status !== 'active') return;
        patchState(store, { presentation: null, operation: { kind: 'idle' } });
      },
      clearSession(): void {
        patchState(store, {
          session: null, presentation: null, operation: { kind: 'idle' }, sessionRatings: {},
          sessionNewCardCount: 0, completedSession: null, lastReviewedCardId: null,
        });
        void clearPersistedActiveSession();
      },
    };
  }),
);
