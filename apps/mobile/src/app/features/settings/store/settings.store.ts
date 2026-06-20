import { computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import type { UserSettings, UpdateUserSettingsDto } from '@lingua-card/shared/domain';
import { DEFAULT_STUDY_GOALS } from '@lingua-card/shared/domain';
import { SettingsApiService } from '../services/settings-api.service';
import { SyncService } from '../../../core/services/sync.service';

const GOAL_PROMPT_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

interface SettingsState {
  settings: UserSettings | null;
  loaded: boolean;
}

const initial: SettingsState = { settings: null, loaded: false };

export const SettingsStore = signalStore(
  { providedIn: 'root' },
  withState(initial),
  withComputed(({ settings, loaded }) => ({
    needsGoalSetup: computed(() => {
      if (!loaded()) return false;
      const s = settings();
      if (!s) return false;
      if (s.goalsSetAt === null) return true;
      return Date.now() - new Date(s.goalsSetAt).getTime() > GOAL_PROMPT_INTERVAL_MS;
    }),
  })),
  withMethods(store => {
    const api = inject(SettingsApiService);
    const sync = inject(SyncService);

    return {
      async load(): Promise<void> {
        try {
          const settings = await firstValueFrom(api.get());
          patchState(store, { settings, loaded: true });
          // Sync device timezone after state is patched, using proper error handling
          // with offline queueing rather than a fire-and-forget Observable subscribe.
          if (settings.timezone === 'UTC') {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (tz && tz !== 'UTC') {
              patchState(store, { settings: { ...settings, timezone: tz } });
              const dto: UpdateUserSettingsDto = { timezone: tz, clientUpdatedAt: new Date().toISOString() };
              try {
                const saved = await firstValueFrom(api.update(dto));
                patchState(store, { settings: saved });
              } catch {
                await sync.enqueue({ type: 'PATCH_SETTINGS', payload: dto });
              }
            }
          }
        } catch {
          patchState(store, { loaded: true });
        }
      },

      async update(dto: UpdateUserSettingsDto): Promise<void> {
        // Stamp the edit with the on-device time so the server can resolve
        // conflicts by last-write-wins. The queued payload carries the same
        // original edit time, so a stale offline edit stays stale even if it
        // reaches the server long after a newer edit from another device.
        const stamped: UpdateUserSettingsDto = { ...dto, clientUpdatedAt: new Date().toISOString() };
        // Optimistic — apply immediately so the UI responds instantly.
        const current = store.settings();
        if (current) {
          patchState(store, { settings: { ...current, ...dto } });
        }
        try {
          const saved = await firstValueFrom(api.update(stamped));
          patchState(store, { settings: saved });
        } catch {
          // Offline or transient failure — queue for retry when connectivity returns.
          // The optimistic value stays in memory; the server will be updated on reconnect.
          await sync.enqueue({ type: 'PATCH_SETTINGS', payload: stamped });
        }
      },

      // Called by SettingsSyncHandler and SettingsRefresher to apply a server
      // response without triggering another API write.
      setFromServer(settings: UserSettings): void {
        patchState(store, { settings, loaded: true });
      },

      dailyGoal(): number {
        return store.settings()?.dailyGoal ?? DEFAULT_STUDY_GOALS.dailyGoal;
      },

      weeklyGoal(): number {
        return store.settings()?.weeklyGoal ?? DEFAULT_STUDY_GOALS.weeklyGoal;
      },
    };
  }),
);
