import { computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { localDayKey, startOfLocalWeek } from '@lingua-card/shared/utils';
import type { StreakStatus, GoalProgress } from '@lingua-card/shared/domain';
import { DEFAULT_STUDY_GOALS } from '@lingua-card/shared/domain';
import { ReviewStore } from '../../features/review/store/review.store';
import { SettingsStore } from '../../features/settings/store/settings.store';
import { StatsApiService } from '../../core/services/stats-api.service';
import { sessionCardIds } from '../../features/review/models/review.model';

export interface WeekDay {
  label: string;
  count: number;
  isToday: boolean;
  isPast: boolean;
  heightPct: number;
}

interface ReviewStatsState {
  serverStreak: StreakStatus | null;
  serverWeeklyProgress: GoalProgress | null;
  serverMonthlyProgress: GoalProgress | null;
}

export const ReviewStatsStore = signalStore(
  { providedIn: 'root' },
  withState<ReviewStatsState>({ serverStreak: null, serverWeeklyProgress: null, serverMonthlyProgress: null }),

  withComputed((state) => {
    const reviewStore = inject(ReviewStore);
    const settingsStore = inject(SettingsStore);
    const sessions = reviewStore.sessionHistory;

    const dailyGoal = computed(() =>
      settingsStore.settings()?.dailyGoal ?? DEFAULT_STUDY_GOALS.dailyGoal
    );

    // Map of localDayKey -> count of distinct card IDs reviewed
    const distinctCardsByDay = computed(() => {
      const byDay = new Map<string, Set<string>>();
      for (const s of sessions()) {
        if (!s.completedAt) continue;
        const key = localDayKey(new Date(s.completedAt));
        const set = byDay.get(key) ?? new Set<string>();
        for (const id of sessionCardIds(s)) set.add(id);
        byDay.set(key, set);
      }
      return new Map([...byDay].map(([k, v]) => [k, v.size]));
    });

    const completedToday = computed(() => {
      const todayKey = localDayKey(new Date());
      return distinctCardsByDay().get(todayKey) ?? 0;
    });

    // Walk consecutive goal-met days backward from a starting key
    const countRun = (startKey: string, counts: Map<string, number>, goal: number): number => {
      let run = 0;
      let cursor = startKey;
      while ((counts.get(cursor) ?? 0) >= goal) {
        run++;
        const [y, m, d] = cursor.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d));
        dt.setUTCDate(dt.getUTCDate() - 1);
        cursor = dt.toISOString().slice(0, 10);
      }
      return run;
    };

    // Optimistic goal-based streak computed locally
    const optimisticStreak = computed<StreakStatus>(() => {
      const goal = dailyGoal();
      const counts = distinctCardsByDay();
      const today = new Date();
      const todayKey = localDayKey(today);
      const yesterdayKey = localDayKey(new Date(today.getTime() - 86_400_000));

      const metGoal = (key: string) => (counts.get(key) ?? 0) >= goal;

      let streakState: StreakStatus['state'];
      let cursor: string;
      if (metGoal(todayKey)) {
        streakState = 'safe';
        cursor = todayKey;
      } else if (metGoal(yesterdayKey)) {
        streakState = 'at_risk';
        cursor = yesterdayKey;
      } else {
        const lastGoalMetDate = [...counts.keys()]
          .filter(k => (counts.get(k) ?? 0) >= goal)
          .sort()
          .at(-1) ?? null;
        // longest=0: local session history is capped at MAX_SESSION_HISTORY so it can
        // under-count. Server value is authoritative; UI should not display longest
        // until serverStreak has loaded.
        return { current: 0, longest: 0, state: 'broken', lastGoalMetDate };
      }

      const current = countRun(cursor, counts, goal);
      const lastGoalMetDate = metGoal(todayKey) ? todayKey : yesterdayKey;

      // longest=0 here too: the server value will overwrite once it arrives.
      return { current, longest: 0, state: streakState, lastGoalMetDate };
    });

    // Prefer server value; fall back to optimistic when offline / not loaded
    const streak = computed<StreakStatus>(() => state.serverStreak() ?? optimisticStreak());

    const dayStreak = computed(() => streak().current);

    const last7DaysActivity = computed(() => {
      const goal = dailyGoal();
      const counts = distinctCardsByDay();
      const today = new Date();
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - (6 - i));
        return (counts.get(localDayKey(d)) ?? 0) >= goal;
      });
    });

    const weeklyData = computed((): WeekDay[] => {
      const allSessions = sessions();
      const today = new Date();
      const weekStart = startOfLocalWeek(today);
      const labels = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
      const todayKey = localDayKey(today);

      const data = labels.map((label, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        const dayKey = localDayKey(d);
        const dayIds = new Set<string>();
        for (const s of allSessions) {
          if (s.completedAt && localDayKey(new Date(s.completedAt)) === dayKey) {
            for (const id of sessionCardIds(s)) dayIds.add(id);
          }
        }
        const currentDow = (today.getDay() + 6) % 7;
        return { label, count: dayIds.size, isToday: dayKey === todayKey, isPast: i < currentDow };
      });

      const maxCount = Math.max(...data.map(d => d.count), 1);
      return data.map(d => ({ ...d, heightPct: Math.max(4, Math.round((d.count / maxCount) * 50)) }));
    });

    // Always derived from ISO-week chart data so label and bars always agree.
    // serverWeeklyProgress is used only for weeklyGoal, not for this total.
    const weeklyTotal = computed(() =>
      weeklyData().reduce((sum, d) => sum + d.count, 0)
    );

    const weeklyGoal = computed(() =>
      state.serverWeeklyProgress()?.goal ??
      (settingsStore.settings()?.weeklyGoal ?? DEFAULT_STUDY_GOALS.weeklyGoal)
    );

    const monthlyTotal = computed(() => state.serverMonthlyProgress()?.reviewed ?? null);

    const monthlyGoal = computed(() =>
      state.serverMonthlyProgress()?.goal ??
      (settingsStore.settings()?.monthlyGoal ?? DEFAULT_STUDY_GOALS.monthlyGoal)
    );

    return {
      completedToday, dailyGoal, dayStreak, streak, optimisticStreak,
      last7DaysActivity, weeklyData, weeklyTotal, weeklyGoal, monthlyTotal, monthlyGoal,
    };
  }),

  withMethods((store) => {
    const statsApi = inject(StatsApiService);
    return {
      async refreshStreak(): Promise<void> {
        try {
          const s = await firstValueFrom(statsApi.streak());
          patchState(store, { serverStreak: s });
        } catch {
          // keep optimistic
        }
      },

      async refreshGoalProgress(): Promise<void> {
        try {
          const [weekly, monthly] = await Promise.all([
            firstValueFrom(statsApi.goalProgress('weekly')),
            firstValueFrom(statsApi.goalProgress('monthly')),
          ]);
          patchState(store, { serverWeeklyProgress: weekly, serverMonthlyProgress: monthly });
        } catch {
          // keep local computed values
        }
      },
    };
  }),
);
