import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withState } from '@ngrx/signals';
import { localDayKey, startOfLocalWeek } from '@lingua-card/shared/utils';
import { ReviewStore } from '../../features/review/store/review.store';
import { sessionCardIds } from '../../features/review/models/review.model';

export interface WeekDay {
  label: string;
  count: number;
  isToday: boolean;
  isPast: boolean;
  heightPct: number;
}

/**
 * Shared facade for session-derived stats. Inject this in any feature that
 * needs streak, weekly, or "completed today" data instead of injecting
 * ReviewStore directly (which is review-feature-owned).
 *
 * All day bucketing uses local time via `localDayKey()` so a late-evening
 * session lands on the correct calendar day regardless of UTC offset.
 */
export const ReviewStatsStore = signalStore(
  { providedIn: 'root' },
  withState({}),

  withComputed(() => {
    const reviewStore = inject(ReviewStore);
    const sessions = reviewStore.sessionHistory;

    const completedToday = computed(() => {
      const todayKey = localDayKey(new Date());
      const seenIds = new Set<string>();
      for (const s of sessions()) {
        if (s.completedAt && localDayKey(new Date(s.completedAt)) === todayKey) {
          for (const id of sessionCardIds(s)) seenIds.add(id);
        }
      }
      return seenIds.size;
    });

    const dayStreak = computed(() => {
      const allSessions = sessions();
      if (allSessions.length === 0) return 0;

      const dates = new Set(
        allSessions
          .filter(s => s.completedAt)
          .map(s => localDayKey(new Date(s.completedAt!)))
      );

      const today = new Date();
      const todayKey = localDayKey(today);
      const yesterdayKey = localDayKey(new Date(today.getTime() - 86_400_000));

      const startOffset = dates.has(todayKey) ? 0 : dates.has(yesterdayKey) ? 1 : -1;
      if (startOffset === -1) return 0;

      let streak = 0;
      for (let i = startOffset; i < 365; i++) {
        const d = new Date(today.getTime() - i * 86_400_000);
        if (dates.has(localDayKey(d))) {
          streak++;
        } else {
          break;
        }
      }
      return streak;
    });

    const last7DaysActivity = computed(() => {
      const allSessions = sessions();
      const today = new Date();
      const streak = dayStreak();

      const streakDates = new Set<string>();
      const hasToday = allSessions.some(
        s => s.completedAt && localDayKey(new Date(s.completedAt)) === localDayKey(today)
      );

      if (hasToday) {
        for (let i = 0; i < streak; i++) {
          streakDates.add(localDayKey(new Date(today.getTime() - i * 86_400_000)));
        }
      } else if (streak > 0) {
        for (let i = 1; i <= streak; i++) {
          streakDates.add(localDayKey(new Date(today.getTime() - i * 86_400_000)));
        }
      }

      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - (6 - i));
        return streakDates.has(localDayKey(d));
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
        const currentDow = (today.getDay() + 6) % 7; // Mon=0
        return { label, count: dayIds.size, isToday: dayKey === todayKey, isPast: i < currentDow };
      });

      const maxCount = Math.max(...data.map(d => d.count), 1);
      return data.map(d => ({ ...d, heightPct: Math.max(4, Math.round((d.count / maxCount) * 50)) }));
    });

    const weeklyTotal = computed(() =>
      weeklyData().reduce((sum, d) => sum + d.count, 0)
    );

    return { completedToday, dayStreak, last7DaysActivity, weeklyData, weeklyTotal };
  }),
);
