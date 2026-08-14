import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { DEFAULT_STUDY_GOALS } from '@lingua-card/shared/domain';
import type { GoalProgress, StreakStatus } from '@lingua-card/shared/domain';
import { localDayKey, startOfLocalWeek } from '@lingua-card/shared/utils';
import { StatsApiService } from '../../../core/services/stats-api.service';
import { SettingsStore } from '../../settings/store/settings.store';
import { ReviewStore } from './review.store';

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

function previousDay(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function consecutiveGoalDays(startKey: string, counts: ReadonlyMap<string, number>, goal: number): number {
  let count = 0;
  let cursor = startKey;
  while ((counts.get(cursor) ?? 0) >= goal) {
    count += 1;
    cursor = previousDay(cursor);
  }
  return count;
}

export const ReviewStatsStore = signalStore(
  { providedIn: 'root' },
  withState<ReviewStatsState>({
    serverStreak: null,
    serverWeeklyProgress: null,
    serverMonthlyProgress: null,
  }),
  withComputed(state => {
    const reviewStore = inject(ReviewStore);
    const settingsStore = inject(SettingsStore);
    const uniqueEvents = computed(() => [
      ...new Map(reviewStore.committedEvents().map(event => [event.eventId, event])).values(),
    ]);
    const dailyGoal = computed(() => settingsStore.settings()?.dailyGoal ?? DEFAULT_STUDY_GOALS.dailyGoal);
    const distinctCardsByDay = computed(() => {
      const cardsByDay = new Map<string, Set<string>>();
      for (const event of uniqueEvents()) {
        const dayKey = localDayKey(new Date(event.reviewedAt));
        const cardIds = cardsByDay.get(dayKey) ?? new Set<string>();
        cardIds.add(event.cardId);
        cardsByDay.set(dayKey, cardIds);
      }
      return new Map([...cardsByDay].map(([dayKey, cardIds]) => [dayKey, cardIds.size]));
    });
    const completedToday = computed(() => distinctCardsByDay().get(localDayKey(new Date())) ?? 0);
    const optimisticStreak = computed<StreakStatus>(() => {
      const counts = distinctCardsByDay();
      const goal = dailyGoal();
      const todayKey = localDayKey(new Date());
      const yesterdayKey = previousDay(todayKey);
      const goalMet = (dayKey: string): boolean => (counts.get(dayKey) ?? 0) >= goal;
      if (!goalMet(todayKey) && !goalMet(yesterdayKey)) {
        const lastGoalMetDate = [...counts.keys()].filter(goalMet).sort().at(-1) ?? null;
        return { current: 0, longest: 0, state: 'broken', lastGoalMetDate };
      }
      const safe = goalMet(todayKey);
      const startKey = safe ? todayKey : yesterdayKey;
      return {
        current: consecutiveGoalDays(startKey, counts, goal),
        longest: 0,
        state: safe ? 'safe' : 'at_risk',
        lastGoalMetDate: startKey,
      };
    });
    const streak = computed(() => state.serverStreak() ?? optimisticStreak());
    const last7DaysActivity = computed(() => {
      const counts = distinctCardsByDay();
      const goal = dailyGoal();
      const today = new Date();
      return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(today);
        date.setDate(today.getDate() - (6 - index));
        return (counts.get(localDayKey(date)) ?? 0) >= goal;
      });
    });
    const weeklyData = computed<WeekDay[]>(() => {
      const counts = distinctCardsByDay();
      const today = new Date();
      const weekStart = startOfLocalWeek(today);
      const todayKey = localDayKey(today);
      const currentDayIndex = (today.getDay() + 6) % 7;
      const days = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((label, index) => {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + index);
        const dayKey = localDayKey(date);
        return { label, count: counts.get(dayKey) ?? 0, isToday: dayKey === todayKey, isPast: index < currentDayIndex };
      });
      const maximum = Math.max(...days.map(day => day.count), 1);
      return days.map(day => ({ ...day, heightPct: Math.max(4, Math.round((day.count / maximum) * 50)) }));
    });
    const weeklyTotal = computed(() => weeklyData().reduce((sum, day) => sum + day.count, 0));
    const weeklyGoal = computed(() => state.serverWeeklyProgress()?.goal
      ?? settingsStore.settings()?.weeklyGoal
      ?? DEFAULT_STUDY_GOALS.weeklyGoal);
    const monthlyTotal = computed(() => state.serverMonthlyProgress()?.reviewed ?? null);
    const monthlyGoal = computed(() => state.serverMonthlyProgress()?.goal
      ?? settingsStore.settings()?.monthlyGoal
      ?? DEFAULT_STUDY_GOALS.monthlyGoal);
    return {
      completedToday,
      dailyGoal,
      dayStreak: computed(() => streak().current),
      streak,
      optimisticStreak,
      last7DaysActivity,
      weeklyData,
      weeklyTotal,
      weeklyGoal,
      monthlyTotal,
      monthlyGoal,
    };
  }),
  withMethods(store => {
    const statsApi = inject(StatsApiService);
    return {
      async refreshStreak(): Promise<void> {
        try {
          patchState(store, { serverStreak: await firstValueFrom(statsApi.streak()) });
        } catch {
          patchState(store, { serverStreak: null });
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
          patchState(store, { serverWeeklyProgress: null, serverMonthlyProgress: null });
        }
      },
    };
  }),
);
