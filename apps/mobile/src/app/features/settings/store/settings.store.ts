import { computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import type { UserSettings, UpdateUserSettingsDto } from '@lingua-card/shared/domain';
import { DEFAULT_STUDY_GOALS } from '@lingua-card/shared/domain';
import { SettingsApiService } from '../services/settings-api.service';
import { SyncService } from '../../../core/services/sync.service';
import { AuthService } from '../../../core/services/auth.service';
import { LocalDataService } from '../../../core/services/local-data.service';

const GOAL_PROMPT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

interface SettingsState {
  settings: UserSettings | null;
  loaded: boolean;
  updateStatus: 'idle' | 'saving' | 'pending-sync';
}

const initial: SettingsState = { settings: null, loaded: false, updateStatus: 'idle' };

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
    const auth = inject(AuthService);
    const localData = inject(LocalDataService);

    return {
      async load(): Promise<void> {
        const userId = auth.currentUser()?.id;
        if (userId) {
          try {
            const cached = await localData.getSettings(userId);
            if (cached) patchState(store, { settings: cached, loaded: true });
          } catch {
            // Continue to the API when device storage is temporarily unavailable.
          }
        }
        if (!navigator.onLine) {
          patchState(store, { loaded: true });
          return;
        }
        try {
          const settings = await firstValueFrom(api.get());
          patchState(store, { settings, loaded: true, updateStatus: 'idle' });
          if (userId) await localData.setSettings(userId, settings);
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
                if (userId) await localData.setSettings(userId, saved);
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
        patchState(store, { updateStatus: 'saving' });
        const stamped: UpdateUserSettingsDto = { ...dto, clientUpdatedAt: new Date().toISOString() };
        const current = store.settings();
        if (current) {
          const { completeOnboarding } = dto;
          const settingsFields = { ...dto };
          delete settingsFields.completeOnboarding;
          delete settingsFields.clientUpdatedAt;
          const optimistic: Partial<UserSettings> = { ...settingsFields };
          if (completeOnboarding === true) {
            optimistic.onboardingCompletedAt = new Date().toISOString();
          } else if (completeOnboarding === false) {
            optimistic.onboardingCompletedAt = null;
          }
          patchState(store, { settings: { ...current, ...optimistic } });
        }
        try {
          const saved = await firstValueFrom(api.update(stamped));
          patchState(store, { settings: saved, updateStatus: 'idle' });
          const userId = auth.currentUser()?.id;
          if (userId) {
            try {
              await localData.setSettings(userId, saved);
            } catch {
              return;
            }
          }
        } catch {
          // Offline or transient failure — queue for retry when connectivity returns.
          // The optimistic value stays in memory; the server will be updated on reconnect.
          await sync.enqueue({ type: 'PATCH_SETTINGS', payload: stamped });
          patchState(store, { updateStatus: 'pending-sync' });
          const userId = auth.currentUser()?.id;
          const optimistic = store.settings();
          if (userId && optimistic) await localData.setSettings(userId, optimistic);
        }
      },

      // Called by SettingsSyncHandler and SettingsRefresher to apply a server
      // response without triggering another API write.
      setFromServer(settings: UserSettings): void {
        patchState(store, { settings, loaded: true, updateStatus: 'idle' });
        const userId = auth.currentUser()?.id;
        if (userId) void localData.setSettings(userId, settings).catch(() => undefined);
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
