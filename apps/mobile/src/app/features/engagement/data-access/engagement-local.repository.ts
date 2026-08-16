import { inject, Injectable } from '@angular/core';
import { LocalDataService } from '../../../core/services/local-data.service';
import { PersistedEngagementState } from './engagement-local.models';

@Injectable({ providedIn: 'root' })
export class EngagementLocalRepository {
  private readonly localData = inject(LocalDataService);
  private readonly mutationChains = new Map<string, Promise<void>>();

  state(userId: string): Promise<PersistedEngagementState> {
    return this.localData.getEngagementState(userId);
  }

  async mutate(
    userId: string,
    update: (state: PersistedEngagementState) => PersistedEngagementState,
  ): Promise<PersistedEngagementState> {
    const previous = this.mutationChains.get(userId) ?? Promise.resolve();
    let result: PersistedEngagementState | null = null;
    const current = previous.then(async () => {
      const state = await this.localData.getEngagementState(userId);
      result = update(state);
      if (result !== state) await this.localData.setEngagementState(userId, result);
    });
    this.mutationChains.set(userId, current.catch(() => undefined));
    await current;
    if (!result) throw new Error('Engagement state mutation did not complete');
    return result;
  }
}
