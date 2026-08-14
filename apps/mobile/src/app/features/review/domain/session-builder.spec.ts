import { createNewSchedulingState } from './review-domain';
import { ReviewCandidate, buildReviewSession, selectSessionCandidates } from './session-builder';

const now = new Date('2026-08-14T10:00:00.000Z');
const policy = { newCardLimit: 2 };

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
  test('distinguishes an empty library from a source that matched nothing', () => {
    const request = { source: { kind: 'daily' } as const, mode: 'typing' as const, direction: 'mixed' as const, limit: 10 };
    expect(selectSessionCandidates([], request, policy, now)).toEqual({ kind: 'empty_library' });
    expect(selectSessionCandidates([candidate('A')], { ...request, source: { kind: 'collection', collectionId: 'missing' } }, policy, now))
      .toEqual({ kind: 'source_matched_nothing' });
  });

  test('orders due cards before policy-limited new cards with stable card-id ties', () => {
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
      cardIds: ['due-a', 'due-b', 'new-first', 'new-second'],
    });
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
    expect(() => selectSessionCandidates([candidate('A')], request, { newCardLimit: -1 }, now))
      .toThrow('New-card limit must be a non-negative integer');
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
