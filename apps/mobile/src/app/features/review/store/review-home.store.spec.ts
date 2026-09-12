import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { createNewReviewSchedulingState, type ScheduledCard } from '@lingua-card/shared/domain';
import { EngagementStore } from '../../engagement/state/engagement.store';
import { SettingsStore } from '../../settings/store/settings.store';
import { CardStore } from '../../vault/store/card.store';
import {
  ReviewSessionPlanningService,
  type ReviewSessionPlanResult,
} from '../application/review-session-planning.service';
import { createReviewSession, type ReviewSessionState } from '../domain/review-domain';
import { ReviewPrefsService } from '../services/review-prefs.service';
import { ReviewHomeStore } from './review-home.store';
import { ReviewStore } from './review.store';

function card(id: string, stage: 'new' | 'familiar' = 'familiar'): ScheduledCard {
  return {
    id,
    deckId: 'deck-1',
    collectionId: null,
    userId: 'user-1',
    contextId: 'context-1',
    content: {
      front: id,
      back: id,
      article: null,
      gender: null,
      plural: null,
      examples: [],
      synonyms: [],
      notes: '',
      imageUrl: null,
      phonetic: null,
    },
    categoryIds: [],
    tags: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    version: 1,
    reviewState: { ...createNewReviewSchedulingState(id), stage },
  };
}

function activeSession(): ReviewSessionState {
  return {
    ...createReviewSession({
      id: 'session-1',
      source: { kind: 'daily' },
      mode: 'typing',
      direction: 'source_to_target',
      originalCardIds: ['new-1', 'review-1'],
      startedAt: new Date('2026-09-11T08:00:00.000Z'),
    }),
    completedOriginalCardIds: ['new-1'],
  };
}

describe('ReviewHomeStore', () => {
  function configure(options: {
    session?: ReviewSessionState | null;
    completedToday?: number;
    goal?: number;
    planResult?: ReviewSessionPlanResult;
    cards?: readonly ScheduledCard[];
  } = {}): { store: InstanceType<typeof ReviewHomeStore>; plan: jest.Mock } {
    const plan = jest.fn().mockResolvedValue(options.planResult ?? {
      kind: 'ready',
      plan: {
        cardIds: ['review-1'],
        dueCards: 0,
        newCards: 0,
        reviewCards: 1,
        estimatedMinutes: 1,
      },
    });
    TestBed.configureTestingModule({
      providers: [
        ReviewHomeStore,
        { provide: ReviewSessionPlanningService, useValue: { plan } },
        { provide: ReviewStore, useValue: { session: signal(options.session ?? null) } },
        {
          provide: EngagementStore,
          useValue: {
            completedToday: signal(options.completedToday ?? 0),
            dailyGoal: signal(options.goal ?? 20),
            streak: signal({ current: 6 }),
          },
        },
        { provide: SettingsStore, useValue: { settings: signal({ timezone: 'Europe/Berlin' }) } },
        {
          provide: ReviewPrefsService,
          useValue: {
            mode: signal('type'),
            dir: signal('en-de'),
            autoplay: signal('answer_and_example'),
          },
        },
        {
          provide: CardStore,
          useValue: { cards: signal(options.cards ?? [card('review-1')]) },
        },
      ],
    });
    return { store: TestBed.inject(ReviewHomeStore), plan };
  }

  it('starts in an explicit loading state', () => {
    const {store} = configure();

    expect(store.viewModel()).toEqual({kind: 'loading'});
    expect(store.dashboard()).toEqual({
      completedToday: 0,
      goal: 20,
      streak: 6,
      preferences: {mode: 'type', autoplay: 'answer_and_example'},
    });
  });

  it('prioritizes an active session without calculating a replacement plan', async () => {
    const { store, plan } = configure({
      session: activeSession(),
      completedToday: 20,
      cards: [card('new-1', 'new'), card('review-1')],
    });

    await store.refresh();

    expect(store.viewModel()).toEqual({
      kind: 'resume',
      sessionId: 'session-1',
      remainingCards: 1,
      estimatedMinutes: 1,
      sessionProgress: 0.5,
    });
    expect(plan).not.toHaveBeenCalled();
  });

  it('publishes the exact plan returned by the planning boundary', async () => {
    const planResult = {
      kind: 'ready',
      plan: {
        cardIds: ['new-1', 'review-1'],
        dueCards: 0,
        newCards: 1,
        reviewCards: 1,
        estimatedMinutes: 2,
      },
    } satisfies ReviewSessionPlanResult;
    const { store } = configure({ completedToday: 8, planResult });

    await store.refresh();

    expect(store.viewModel()).toEqual({
      kind: 'ready',
      plan: planResult.plan,
    });
  });

  it('keeps the completed goal visible while offering another bounded session', async () => {
    const { store, plan } = configure({ completedToday: 20, goal: 20 });

    await store.refresh();

    expect(store.viewModel()).toEqual({
      kind: 'complete',
      reviewedToday: 20,
      goal: 20,
      continuation: {
        kind: 'ready',
        plan: {
          cardIds: ['review-1'],
          dueCards: 0,
          newCards: 0,
          reviewCards: 1,
          estimatedMinutes: 1,
        },
      },
    });
    expect(plan).toHaveBeenCalledWith(
      expect.objectContaining({limit: 20}),
      expect.any(Date),
      {timeZone: 'Europe/Berlin'},
    );
  });

  it('keeps completion non-blocking when there is no continuation plan', async () => {
    const {store} = configure({
      completedToday: 20,
      goal: 20,
      planResult: {kind: 'nothing_eligible'},
    });

    await store.refresh();

    expect(store.viewModel()).toEqual({
      kind: 'complete',
      reviewedToday: 20,
      goal: 20,
      continuation: {kind: 'none'},
    });
  });

  it('updates a previously ready continuation when no cards remain eligible', async () => {
    const {store, plan} = configure({completedToday: 20, goal: 20});
    await store.refresh();
    expect(store.viewModel()).toMatchObject({
      kind: 'complete',
      continuation: {kind: 'ready'},
    });

    plan.mockResolvedValueOnce({kind: 'nothing_eligible'});
    await store.refresh();

    expect(store.viewModel()).toEqual({
      kind: 'complete',
      reviewedToday: 20,
      goal: 20,
      continuation: {kind: 'none'},
    });
  });

  it('preserves the completed goal when optional continuation planning fails', async () => {
    const {store} = configure({
      completedToday: 20,
      goal: 20,
      planResult: {
        kind: 'load_failed',
        error: {code: 'cards_unavailable', message: 'Cards could not be loaded.'},
      },
    });

    await store.refresh();

    expect(store.viewModel()).toEqual({
      kind: 'complete',
      reviewedToday: 20,
      goal: 20,
      continuation: {kind: 'error'},
    });
  });

  it('maps empty and recoverable planning failures to explicit landing states', async () => {
    const empty = configure({ planResult: { kind: 'empty_library' } }).store;
    await empty.refresh();
    expect(empty.viewModel()).toEqual({ kind: 'empty' });

    TestBed.resetTestingModule();
    const failed = configure({
      planResult: {
        kind: 'load_failed',
        error: { code: 'cards_unavailable', message: 'Cards could not be loaded.' },
      },
    }).store;
    await failed.refresh();
    expect(failed.viewModel()).toEqual({kind: 'error'});
  });

  it('maps an ineligible queue to the caught-up landing state', async () => {
    const {store} = configure({planResult: {kind: 'nothing_eligible'}});

    await store.refresh();

    expect(store.viewModel()).toEqual({kind: 'nothing-eligible'});
  });
});
