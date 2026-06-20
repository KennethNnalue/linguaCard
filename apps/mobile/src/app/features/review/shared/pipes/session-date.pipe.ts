import { inject, Pipe, PipeTransform } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { localDayKey } from '@lingua-card/shared/utils';

// Impure: output depends on the active UI language (via TranslateService), which
// can change without the input ISO date changing. A pure pipe would cache stale labels.
@Pipe({ name: 'sessionDate', pure: false })
export class SessionDatePipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

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

    if (sessionDay === todayDay) return `${this.translate.instant('common.today')}${timeStr}`;
    if (sessionDay === yesterdayDay) return `${this.translate.instant('common.yesterday')}${timeStr}`;

    const todayMidnight = new Date(todayDay).getTime();
    const sessionMidnight = new Date(sessionDay).getTime();
    const diffDays = Math.round((todayMidnight - sessionMidnight) / 86_400_000);
    return `${this.translate.instant('common.daysAgoLabel', { count: diffDays })}${timeStr}`;
  }
}
