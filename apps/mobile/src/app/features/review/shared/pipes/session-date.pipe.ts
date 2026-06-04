import { Pipe, PipeTransform } from '@angular/core';
import { localDayKey } from '@lingua-card/shared/utils';

/** Formats a session ISO timestamp to "Today", "Yesterday", or "N days ago".
 *  Pass `withTime: true` to append ", HH:MM" (used in session history).
 *  Uses local-time calendar dates so labels agree with the weekly chart. */
@Pipe({ name: 'sessionDate', pure: true })
export class SessionDatePipe implements PipeTransform {
  transform(isoDate: string, withTime = false): string {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    const timeStr = withTime
      ? ', ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

    const today = new Date();
    const sessionDay = localDayKey(date);
    const todayDay = localDayKey(today);
    const yesterdayDay = localDayKey(new Date(today.getTime() - 86_400_000));

    if (sessionDay === todayDay) return `Today${timeStr}`;
    if (sessionDay === yesterdayDay) return `Yesterday${timeStr}`;

    // Parse local-day keys as midnight UTC for diff (same offset both sides → correct diff)
    const todayMidnight = new Date(todayDay).getTime();
    const sessionMidnight = new Date(sessionDay).getTime();
    const diffDays = Math.round((todayMidnight - sessionMidnight) / 86_400_000);
    return `${diffDays} days ago${timeStr}`;
  }
}
