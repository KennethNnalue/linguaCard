import { createNewSchedulingState } from './review-domain';
import {
  ReviewCandidate,
  buildReviewSession,
  remainingDailyNewCardLimit,
  selectSessionCandidates,
} from './session-builder';

const now = new Date('2026-08-14T10:00:00.000Z');
const policy = { newCardLimit: 2, newCardRatio: 0.25 };

function candidate(
  cardId: string,
  options: {
    collectionId?: string | null;
    createdAt?: string;
    dueAt?: string;
    stage?: 'new' | 'learning' | 'familiar' | 'strong' | 'mastered';
    masterySource?: 'earned' | 'manual';
    problemStatus?: 'normal' | 'leech';
    totalAgainCount?: number;
  } = {},
): ReviewCandidate {
  return {
    cardId,
    collectionId: options.collectionId ?? null,
    createdAt: new Date(options.createdAt ?? '2026-08-01T10:00:00.000Z'),
    scheduling: {
      ...createNewSchedulingState(cardId),
      stage: options.stage ?? 'new',
      dueAt: options.dueAt ? new Date(options.dueAt) : undefined,
      masterySource: options.masterySource,
      problemStatus: options.problemStatus ?? 'normal',
      totalAgainCount: options.totalAgainCount ?? 0,
    },
  };
}

describe('session candidate selection', () => {
  test('limits new cards across sessions on the same local day', () => {
    const events = [
      { cardId: 'new-a', stageBefore: 'new' as const, reviewedAt: '2026-08-14T08:00:00.000Z' },
      { cardId: 'new-a', stageBefore: 'new' as const, reviewedAt: '2026-08-14T08:10:00.000Z' },
      { cardId: 'new-b', stageBefore: 'new' as const, reviewedAt: '2026-08-14T09:00:00.000Z' },
      { cardId: 'review-a', stageBefore: 'learning' as const, reviewedAt: '2026-08-14T09:30:00.000Z' },
      { cardId: 'new-yesterday', stageBefore: 'new' as const, reviewedAt: '2026-08-13T09:00:00.000Z' },
    ];

    expect(remainingDailyNewCardLimit(events, now, 5, 'Europe/Berlin')).toBe(3);
  });

  test('uses the configured study timezone for the daily boundary', () => {
    const events = [
      { cardId: 'new-a', stageBefore: 'new' as const, reviewedAt: '2026-08-13T23:30:00.000Z' },
    ];

    const afterNewYorkMidnight = new Date('2026-08-14T04:30:00.000Z');
    expect(remainingDailyNewCardLimit(events, afterNewYorkMidnight, 5, 'Europe/Berlin')).toBe(4);
    expect(remainingDailyNewCardLimit(events, afterNewYorkMidnight, 5, 'America/New_York')).toBe(5);
  });

  test('distinguishes an empty library from a source that matched nothing', () => {
    const request = { source: { kind: 'daily' } as const, mode: 'typing' as const, direction: 'mixed' as const, limit: 10 };
    expect(selectSessionCandidates([], request, policy, now)).toEqual({ kind: 'empty_library' });
    expect(selectSessionCandidates([candidate('A')], { ...request, source: { kind: 'collection', collectionId: 'missing' } }, policy, now))
      .toEqual({ kind: 'source_matched_nothing' });
  });

  test('interleaves policy-limited new cards with due cards', () => {
    const candidates = [
      candidate('new-late', { createdAt: '2026-08-03T00:00:00Z' }),
      candidate('due-b', { stage: 'familiar', dueAt: '2026-08-10T00:00:00Z' }),
      candidate('new-first', { createdAt: '2026-08-01T00:00:00Z' }),
      candidate('due-a', { stage: 'learning', dueAt: '2026-08-10T00:00:00Z' }),
      candidate('new-second', { createdAt: '2026-08-02T00:00:00Z' }),
    ];
    const request = { source: { kind: 'daily' } as const, mode: 'typing' as const, direction: 'source_to_target' as const, limit: 10 };
    expect(selectSessionCandidates(candidates, request, policy, now)).toEqual({
      kind: 'selected',
      cardIds: ['due-a', 'new-first', 'due-b', 'new-second'],
    });
  });

  test('reserves new-card slots when due cards would otherwise fill the session', () => {
    const candidates = [
      ...Array.from({ length: 10 }, (_, index) => candidate(`due-${index}`, {
        stage: 'familiar',
        dueAt: '2026-08-10T00:00:00Z',
      })),
      candidate('new-a', { collectionId: 'collection-a' }),
      candidate('new-b', { collectionId: 'collection-b' }),
    ];
    const result = selectSessionCandidates(candidates, {
      source: { kind: 'daily' }, mode: 'typing', direction: 'mixed', limit: 8,
    }, policy, now);

    expect(result).toEqual({
      kind: 'selected',
      cardIds: ['due-0', 'due-1', 'due-2', 'new-b', 'due-3', 'due-4', 'due-5', 'new-a'],
    });
  });

  test('takes new daily cards from collections in round-robin order', () => {
    const candidates = [
      candidate('a-1', { collectionId: 'a', createdAt: '2026-08-01T00:00:00Z' }),
      candidate('a-2', { collectionId: 'a', createdAt: '2026-08-02T00:00:00Z' }),
      candidate('b-1', { collectionId: 'b', createdAt: '2026-08-03T00:00:00Z' }),
    ];
    const result = selectSessionCandidates(candidates, {
      source: { kind: 'daily' }, mode: 'typing', direction: 'mixed', limit: 8,
    }, policy, now);

    expect(result.kind).toBe('selected');
    if (result.kind !== 'selected') throw new Error('Expected selected cards');
    expect(new Set(result.cardIds)).toEqual(new Set(['a-1', 'b-1']));
  });

  test('rotates the first collection so later collections cannot starve across days', () => {
    const candidates = ['a', 'b', 'c', 'd'].map(collectionId =>
      candidate(`${collectionId}-1`, { collectionId }));
    const request = {
      source: { kind: 'daily' } as const,
      mode: 'typing' as const,
      direction: 'mixed' as const,
      limit: 2,
    };
    const rotationPolicy = { newCardLimit: 2, newCardRatio: 1 };
    const firstDay = selectSessionCandidates(candidates, request, rotationPolicy, now);
    const secondDay = selectSessionCandidates(
      candidates,
      request,
      rotationPolicy,
      new Date(now.getTime() + 86_400_000),
    );

    expect(firstDay).not.toEqual(secondDay);
  });

  test('all-new libraries can start daily review', () => {
    const result = buildReviewSession(
      [candidate('B'), candidate('A')],
      { source: { kind: 'daily' }, mode: 'typing', direction: 'mixed', limit: 10 },
      policy,
      now,
      'session-1',
    );
    expect(result.kind).toBe('started');
    if (result.kind !== 'started') throw new Error('Expected a started session');
    expect(result.session.definition.originalCardIds).toEqual(['A', 'B']);
    expect(result.session.definition.source).toEqual({ kind: 'daily' });
  });

  test('fills a daily session with learned retention cards when fewer cards are due', () => {
    const result = selectSessionCandidates([
      candidate('due', { stage: 'strong', dueAt: '2026-08-10T00:00:00Z' }),
      candidate('retention-a', { stage: 'familiar', dueAt: '2026-09-10T00:00:00Z' }),
      candidate('retention-b', { stage: 'strong', dueAt: '2026-10-10T00:00:00Z' }),
    ], {
      source: { kind: 'daily' }, mode: 'typing', direction: 'mixed', limit: 3,
    }, { newCardLimit: 0, newCardRatio: 0 }, now);

    expect(result).toEqual({ kind: 'selected', cardIds: ['due', 'retention-a', 'retention-b'] });
  });

  test('automatic sources exclude manually mastered cards', () => {
    const request = { source: { kind: 'new-only' } as const, mode: 'recall' as const, direction: 'target_to_source' as const, limit: 5 };
    expect(selectSessionCandidates([candidate('A', { masterySource: 'manual' })], request, policy, now))
      .toEqual({ kind: 'nothing_eligible' });
  });

  test('explicit source preserves requested order', () => {
    const request = { source: { kind: 'explicit', cardIds: ['C', 'A', 'C'] } as const, mode: 'recall' as const, direction: 'source_to_target' as const, limit: 5 };
    expect(selectSessionCandidates([candidate('A'), candidate('B'), candidate('C')], request, policy, now))
      .toEqual({ kind: 'selected', cardIds: ['C', 'A'] });
  });

  test('explicit sources cannot bypass manual-mastery exclusion', () => {
    const request = {
      source: { kind: 'explicit', cardIds: ['A'] } as const,
      mode: 'recall' as const,
      direction: 'source_to_target' as const,
      limit: 5,
    };
    expect(selectSessionCandidates([candidate('A', { masterySource: 'manual' })], request, policy, now))
      .toEqual({ kind: 'nothing_eligible' });
  });

  test('rejects invalid policy limits before building a session', () => {
    const request = { source: { kind: 'daily' } as const, mode: 'typing' as const, direction: 'mixed' as const, limit: 10 };
    expect(() => selectSessionCandidates([candidate('A')], request, { newCardLimit: -1, newCardRatio: 0.25 }, now))
      .toThrow('New-card limit must be a non-negative integer');
    expect(() => selectSessionCandidates([candidate('A')], request, { newCardLimit: 2, newCardRatio: 2 }, now))
      .toThrow('New-card ratio must be between zero and one');
  });

  test('custom card IDs preserve the frozen user-selected order', () => {
    const request = {
      source: { kind: 'custom', filters: { cardIds: ['C', 'A'] } } as const,
      mode: 'typing' as const,
      direction: 'mixed' as const,
      limit: 10,
    };
    expect(selectSessionCandidates([candidate('A'), candidate('B'), candidate('C')], request, policy, now))
      .toEqual({ kind: 'selected', cardIds: ['C', 'A'] });
  });
});
