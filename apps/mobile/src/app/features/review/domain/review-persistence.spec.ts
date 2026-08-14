import type { ScheduledCard } from '@lingua-card/shared/domain';
import { commitReview, createNewSchedulingState, createReviewSession, recordPresentation, skipSessionCard } from './review-domain';
import {
  deserializeReviewSessionState,
  overlayLocalSchedulingStates,
  serializeSchedulingState,
  serializeReviewSessionState,
  toPendingReviewCommit,
} from './review-persistence';

describe('review session persistence', () => {
  test('round-trips active progress and the concrete current presentation', () => {
    const startedAt = new Date('2026-08-14T10:00:00.000Z');
    let session = createReviewSession({
      id: 'session-1',
      source: { kind: 'daily' },
      mode: 'typing',
      direction: 'mixed',
      originalCardIds: ['A', 'B'],
      startedAt,
    });
    session = recordPresentation(session, {
      kind: 'present',
      cardId: 'A',
      presentationKind: 'original',
    });
    session = skipSessionCard(session, 'A', 'original');
    session = recordPresentation(session, {
      kind: 'present',
      cardId: 'B',
      presentationKind: 'original',
    });

    const restored = deserializeReviewSessionState(serializeReviewSessionState(session));

    expect(restored).toEqual(session);
    expect(restored.currentDirection).toBe('target_to_source');
    expect(restored).not.toBe(session);
    expect(restored.definition.originalCardIds).not.toBe(session.definition.originalCardIds);
    expect(restored.definition.startedAt).not.toBe(startedAt);
  });
});

describe('local scheduling recovery', () => {
  test('applies the canonical local state for each card without mutating the input', () => {
    const originalState = createNewSchedulingState('card-1');
    const card: ScheduledCard = {
      id: 'card-1',
      deckId: 'deck-1',
      userId: 'user-1',
      contextId: 'context-1',
      collectionId: null,
      categoryIds: [],
      tags: [],
      content: {
        front: 'front', back: 'back', article: null, gender: null, plural: null,
        examples: [], synonyms: [], notes: '', imageUrl: null, phonetic: null,
      },
      createdAt: '2026-08-14T10:00:00.000Z',
      updatedAt: '2026-08-14T10:00:00.000Z',
      version: 1,
      reviewState: serializeSchedulingState(originalState),
    };
    const committed = commitReview(originalState, {
      reviewId: 'review-1',
      eventId: 'event-1',
      attemptId: 'attempt-1',
      sessionId: 'session-1',
      reviewedAt: new Date('2026-08-14T10:00:00.000Z'),
      reviewMode: 'recall',
      promptDirection: 'source_to_target',
      responseType: 'self_rated',
      rating: 'good',
    });
    const pending = toPendingReviewCommit(committed.event, committed.record, committed.schedule.nextState);

    const recovered = overlayLocalSchedulingStates([card], { 'card-1': pending.nextState });

    expect(recovered[0].reviewState).toEqual(pending.nextState);
    expect(card.reviewState).not.toBe(pending.nextState);
  });
});
