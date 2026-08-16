export type EngagementDayKey = string & { readonly __engagementDayKey: unique symbol };

export interface EngagementDateContext {
  timeZone: string;
  dayKey: EngagementDayKey;
}

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function engagementDayKey(value: string): EngagementDayKey {
  if (!DAY_KEY_PATTERN.test(value)) throw new Error('Engagement day key must use YYYY-MM-DD');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== value) throw new Error('Engagement day key must be a valid calendar date');
  return value as EngagementDayKey;
}

export function resolveEngagementDayKey(reviewedAt: Date, timeZone: string): EngagementDayKey {
  if (!Number.isFinite(reviewedAt.getTime())) throw new Error('Review timestamp must be valid');
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(reviewedAt);
    const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find(candidate => candidate.type === type)?.value ?? '';
    return engagementDayKey(`${part('year')}-${part('month')}-${part('day')}`);
  } catch {
    throw new Error('A valid IANA timezone is required for engagement projection');
  }
}

export interface EngagementCalendar {
  previousDay(dayKey: EngagementDayKey): EngagementDayKey;
  nextDay(dayKey: EngagementDayKey): EngagementDayKey;
  daysBetween(start: EngagementDayKey, end: EngagementDayKey): readonly EngagementDayKey[];
}

export const engagementCalendar: EngagementCalendar = {
  previousDay(dayKey) {
    const date = new Date(`${dayKey}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return engagementDayKey(date.toISOString().slice(0, 10));
  },
  nextDay(dayKey) {
    const date = new Date(`${dayKey}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return engagementDayKey(date.toISOString().slice(0, 10));
  },
  daysBetween(start, end) {
    const result: EngagementDayKey[] = [];
    let cursor = start;
    while (cursor <= end) {
      result.push(cursor);
      const date = new Date(`${cursor}T00:00:00.000Z`);
      date.setUTCDate(date.getUTCDate() + 1);
      cursor = engagementDayKey(date.toISOString().slice(0, 10));
    }
    return result;
  },
};
