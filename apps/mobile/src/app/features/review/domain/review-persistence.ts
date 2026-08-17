import type { CardAdministrationCommand, ReviewRating, ReviewSchedulingState, ScheduledCard } from '@lingua-card/shared/domain';
import {
  CardSchedulingState,
  ReviewCommittedEvent,
  ReviewRecord,
  ReviewSessionState,
} from './review-domain';

export type PersistedCardSchedulingState = ReviewSchedulingState;

export interface PendingReviewCommit {
  event: Omit<ReviewCommittedEvent, 'reviewedAt'> & { reviewedAt: string };
  record: Omit<ReviewRecord, 'reviewedAt'> & { reviewedAt: string };
  nextState: PersistedCardSchedulingState;
}

export interface PendingCardAdministration {
  cardId: string;
  command: CardAdministrationCommand;
}

export interface PersistedReviewLocalState {
  schedulingStates: Readonly<Record<string, PersistedCardSchedulingState>>;
  outbox: readonly PendingReviewCommit[];
  records: readonly PendingReviewCommit['record'][];
  events: readonly PendingReviewCommit['event'][];
  administrationOutbox: readonly PendingCardAdministration[];
}

export interface PersistedReviewSessionState extends Omit<ReviewSessionState, 'definition' | 'completedAt'> {
  definition: Omit<ReviewSessionState['definition'], 'startedAt'> & { startedAt: string };
  completedAt?: string;
}

export interface PersistedActiveReviewSession {
  session: PersistedReviewSessionState;
  ratings: Readonly<Record<string, ReviewRating>>;
  newCardCount: number;
}

export function schedulingStateFor(card: ScheduledCard): CardSchedulingState {
  return deserializeSchedulingState(card.reviewState);
}

export function serializeSchedulingState(state: CardSchedulingState): PersistedCardSchedulingState {
  return {
    ...state,
    dueAt: state.dueAt?.toISOString(),
    manualMasterySnapshot: state.manualMasterySnapshot
      ? { ...state.manualMasterySnapshot, previousDueAt: state.manualMasterySnapshot.previousDueAt?.toISOString() }
      : undefined,
  };
}

export function deserializeSchedulingState(state: PersistedCardSchedulingState): CardSchedulingState {
  return {
    ...state,
    dueAt: state.dueAt ? new Date(state.dueAt) : undefined,
    manualMasterySnapshot: state.manualMasterySnapshot
      ? { ...state.manualMasterySnapshot, previousDueAt: state.manualMasterySnapshot.previousDueAt ? new Date(state.manualMasterySnapshot.previousDueAt) : undefined }
      : undefined,
  };
}

export function toPendingReviewCommit(
  event: ReviewCommittedEvent,
  record: ReviewRecord,
  nextState: CardSchedulingState,
): PendingReviewCommit {
  return {
    event: { ...event, reviewedAt: event.reviewedAt.toISOString() },
    record: { ...record, reviewedAt: record.reviewedAt.toISOString() },
    nextState: serializeSchedulingState(nextState),
  };
}

export function deserializeReviewCommittedEvent(event: PendingReviewCommit['event']): ReviewCommittedEvent {
  const reviewedAt = new Date(event.reviewedAt);
  if (!Number.isFinite(reviewedAt.getTime())) throw new Error('Persisted review timestamp is invalid');
  return { ...event, reviewedAt };
}

export function overlayLocalSchedulingStates(
  cards: readonly ScheduledCard[],
  schedulingStates: Readonly<Record<string, PersistedCardSchedulingState>>,
): ScheduledCard[] {
  return cards.map(card => {
    const reviewState = schedulingStates[card.id];
    return reviewState ? { ...card, reviewState } : card;
  });
}

export function serializeReviewSessionState(session: ReviewSessionState): PersistedReviewSessionState {
  return {
    ...session,
    definition: {
      ...session.definition,
      originalCardIds: [...session.definition.originalCardIds],
      startedAt: session.definition.startedAt.toISOString(),
    },
    completedAt: session.completedAt?.toISOString(),
  };
}

export function deserializeReviewSessionState(session: PersistedReviewSessionState): ReviewSessionState {
  return {
    ...session,
    manuallyMasteredCardIds: session.manuallyMasteredCardIds ?? [],
    definition: {
      ...session.definition,
      originalCardIds: [...session.definition.originalCardIds],
      startedAt: new Date(session.definition.startedAt),
    },
    completedAt: session.completedAt ? new Date(session.completedAt) : undefined,
  };
}
