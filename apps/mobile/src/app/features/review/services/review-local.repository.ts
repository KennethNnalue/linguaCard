import { inject, Injectable } from '@angular/core';
import { LocalDataService } from '../../../core/services/local-data.service';
import { PendingCardAdministration, PendingReviewCommit, PersistedReviewLocalState } from '../domain/review-persistence';
import type { ReviewSchedulingState } from '@lingua-card/shared/domain';

const MAX_LOCAL_REVIEW_HISTORY = 5_000;

@Injectable({ providedIn: 'root' })
export class ReviewLocalRepository {
  private readonly localData = inject(LocalDataService);
  private readonly mutationChains = new Map<string, Promise<void>>();

  async commit(userId: string, commit: PendingReviewCommit): Promise<void> {
    await this.mutate(userId, state => {
      const duplicateEvent = state.events.some(event => event.eventId === commit.event.eventId);
      const duplicateAttempt = state.records.some(record => record.attemptId === commit.record.attemptId);
      if (duplicateEvent || duplicateAttempt) return state;
      return {
        ...state,
        schedulingStates: {
          ...state.schedulingStates,
          [commit.event.cardId]: commit.nextState,
        },
        outbox: [...state.outbox, commit],
        records: [...state.records, commit.record].slice(-MAX_LOCAL_REVIEW_HISTORY),
        events: [...state.events, commit.event].slice(-MAX_LOCAL_REVIEW_HISTORY),
      };
    });
  }

  async pendingCommits(userId: string): Promise<readonly PendingReviewCommit[]> {
    return (await this.localData.getReviewLocalState(userId)).outbox;
  }

  async committedEvents(userId: string): Promise<readonly PendingReviewCommit['event'][]> {
    return (await this.localData.getReviewLocalState(userId)).events;
  }

  async schedulingStates(userId: string): Promise<PersistedReviewLocalState['schedulingStates']> {
    return (await this.localData.getReviewLocalState(userId)).schedulingStates;
  }

  async administer(
    userId: string,
    administration: PendingCardAdministration,
    nextState: ReviewSchedulingState,
  ): Promise<void> {
    await this.mutate(userId, state => ({
      ...state,
      schedulingStates: { ...state.schedulingStates, [administration.cardId]: nextState },
      administrationOutbox: [
        ...(state.administrationOutbox ?? []).filter(item => item.command.commandId !== administration.command.commandId),
        administration,
      ],
    }));
  }

  async pendingAdministrations(userId: string): Promise<readonly PendingCardAdministration[]> {
    return (await this.localData.getReviewLocalState(userId)).administrationOutbox ?? [];
  }

  async removeAdministrationCommands(userId: string, commandIds: ReadonlySet<string>): Promise<void> {
    await this.mutate(userId, state => ({
      ...state,
      administrationOutbox: (state.administrationOutbox ?? [])
        .filter(item => !commandIds.has(item.command.commandId)),
    }));
  }

  async removeOutboxEvents(userId: string, eventIds: ReadonlySet<string>): Promise<void> {
    await this.mutate(userId, state => ({
      ...state,
      outbox: state.outbox.filter(commit => !eventIds.has(commit.event.eventId)),
    }));
  }

  private async mutate(
    userId: string,
    update: (state: PersistedReviewLocalState) => PersistedReviewLocalState,
  ): Promise<void> {
    const previous = this.mutationChains.get(userId) ?? Promise.resolve();
    const current = previous.then(async () => {
      const state = await this.localData.getReviewLocalState(userId);
      const next = update(state);
      if (next !== state) await this.localData.setReviewLocalState(userId, next);
    });
    this.mutationChains.set(userId, current.catch(() => undefined));
    await current;
  }
}
