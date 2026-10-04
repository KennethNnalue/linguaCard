import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { ReviewCommitSyncHandler } from './review-commit-sync.handler';
import { ReviewCommitApiService } from './review-commit-api.service';
import { ReviewLocalRepository } from './review-local.repository';
import { PodcastDiscoveryEventsService } from '../../podcasts/services/podcast-discovery-events.service';
import { commitReview, createNewSchedulingState } from '../domain/review-domain';
import { toPendingReviewCommit } from '../domain/review-persistence';

function pending(eventId: string) {
  const commit = commitReview(createNewSchedulingState('card'), {
    reviewId: eventId, eventId, attemptId: eventId, sessionId: 'session', reviewedAt: new Date('2026-10-04T08:00:00Z'),
    reviewMode: 'recall', promptDirection: 'source_to_target', responseType: 'self_rated', rating: 'good',
  });
  return toPendingReviewCommit(commit.event, commit.record, commit.schedule.nextState);
}
describe('review sync retry safety', () => {
  function setup(commitBatch: ReviewCommitApiService['commitBatch']) {
    let outbox = [pending('first')];
    const refresh = jest.fn();
    const removeOutboxEvents = jest.fn(async (_user: string, ids: ReadonlySet<string>) => {
      outbox = outbox.filter(item => !ids.has(item.event.eventId));
    });
    TestBed.configureTestingModule({ providers: [ReviewCommitSyncHandler,
      { provide: ReviewCommitApiService, useValue: { commitBatch } },
      { provide: ReviewLocalRepository, useValue: { pendingCommits: async () => outbox, removeOutboxEvents } },
      { provide: PodcastDiscoveryEventsService, useValue: { refresh } },
    ] });
    return { handler: TestBed.inject(ReviewCommitSyncHandler), refresh, removeOutboxEvents,
      outbox: () => outbox, append: () => { outbox = [...outbox, pending('later')]; } };
  }
  it('retains unsynced reviews when the server request fails', async () => {
    const state = setup(() => throwError(() => new Error('offline')));
    await expect(state.handler.execute({ userId: 'user' })).rejects.toThrow('offline');
    expect(state.outbox()).toHaveLength(1); expect(state.removeOutboxEvents).not.toHaveBeenCalled();
    expect(state.refresh).not.toHaveBeenCalled();
  });
  it('removes only the transmitted reviews and preserves reviews created during sync', async () => {
    const response = new Subject<{ accepted: number; duplicates: number }>();
    const state = setup(() => response); const syncing = state.handler.execute({ userId: 'user' });
    await Promise.resolve(); state.append(); response.next({ accepted: 1, duplicates: 0 }); await syncing;
    expect(state.outbox().map(item => item.event.eventId)).toEqual(['later']);
    expect(state.refresh).toHaveBeenCalledTimes(1);
  });
  it('clears an already accepted event after an idempotent server retry', async () => {
    const state = setup(() => of({ accepted: 0, duplicates: 1 }));
    await state.handler.execute({ userId: 'user' }); expect(state.outbox()).toEqual([]);
  });
});
