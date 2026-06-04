import { Pipe, PipeTransform } from '@angular/core';

/** Formats a session ISO timestamp to "Today", "Yesterday", or "N days ago".
 *  Pass `withTime: true` to append ", HH:MM" (used in session history).
 *  Uses calendar-date comparison (not ms diff) so midnight boundaries are handled correctly. */
@Pipe({ name: 'sessionDate', pure: true })
export class SessionDatePipe implements PipeTransform {
  transform(isoDate: string, withTime = false): string {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    const timeStr = withTime
      ? ', ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

    const sessionDay = date.toISOString().split('T')[0];
    const todayDay = new Date().toISOString().split('T')[0];
    const yesterdayDay = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];

    if (sessionDay === todayDay) return `Today${timeStr}`;
    if (sessionDay === yesterdayDay) return `Yesterday${timeStr}`;

    // Calendar-correct day difference
    const todayMidnight = new Date(todayDay).getTime();
    const sessionMidnight = new Date(sessionDay).getTime();
    const diffDays = Math.round((todayMidnight - sessionMidnight) / 86_400_000);
    return `${diffDays} days ago${timeStr}`;
  }
}
