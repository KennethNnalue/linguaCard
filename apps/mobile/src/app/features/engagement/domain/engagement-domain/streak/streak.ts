import { EngagementDayKey } from '../shared/engagement-date';

export interface Streak {
  current: number;
  longest: number;
  state: 'safe' | 'at_risk' | 'broken';
  lastQualifiedDayKey: EngagementDayKey | null;
}
