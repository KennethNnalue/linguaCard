import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Location } from '@angular/common';
import { IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronBackOutline } from 'ionicons/icons';
import { localDayKey } from '@lingua-card/shared/utils';
import { ReviewStore } from '../../store/review.store';
import { SessionStatsService } from '../../shared/services/session-stats.service';
import { ReviewStatsStore } from '../../store/review-stats.store';
import { TranslatePipe } from '@ngx-translate/core';
import { SessionDatePipe } from '../../shared/pipes/session-date.pipe';
import { MS_PER_DAY, ReviewSessionHistoryEntry } from '../../models/review.model';

interface SessionGroup {
  labelKey: string;
  sessions: ReviewSessionHistoryEntry[];
}

@Component({
  selector: 'lc-session-history',
  templateUrl: './session-history.page.html',
  styleUrls: ['./session-history.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonHeader, IonToolbar, IonIcon, SessionDatePipe, TranslatePipe],
})
export class SessionHistoryPage {
  private readonly reviewStore = inject(ReviewStore);
  private readonly reviewStats = inject(ReviewStatsStore);
  readonly statsService = inject(SessionStatsService);
  private readonly location = inject(Location);

  constructor() {
    addIcons({ chevronBackOutline });
  }

  readonly weeklyData = this.reviewStats.weeklyData;
  readonly weeklyTotal = this.reviewStats.weeklyTotal;
  readonly dayStreak = this.reviewStats.dayStreak;

  readonly weekMax = computed(() => Math.max(...this.weeklyData().map(d => d.count), 1));

  barHeightPx(count: number): number {
    return Math.max(6, Math.round((count / this.weekMax()) * 72));
  }

  readonly groups = computed<SessionGroup[]>(() => {
    const sessions = this.reviewStore.sessionHistory();
    const todayKey = localDayKey(new Date());
    const yesterdayKey = localDayKey(new Date(Date.now() - MS_PER_DAY));
    const today: ReviewSessionHistoryEntry[] = [];
    const yesterday: ReviewSessionHistoryEntry[] = [];
    const earlier: ReviewSessionHistoryEntry[] = [];
    for (const s of sessions) {
      const key = localDayKey(new Date(s.completedAt ?? s.startedAt));
      if (key === todayKey) today.push(s);
      else if (key === yesterdayKey) yesterday.push(s);
      else earlier.push(s);
    }
    return [
      { labelKey: 'review.history.today', sessions: today },
      { labelKey: 'review.history.yesterday', sessions: yesterday },
      { labelKey: 'review.history.earlier', sessions: earlier },
    ].filter(g => g.sessions.length > 0);
  });

  readonly hasSessions = computed(() => this.reviewStore.sessionHistory().length > 0);

  sessionCards(s: ReviewSessionHistoryEntry): number { return s.reviewedCardIds.length; }
  sessionNailed(s: ReviewSessionHistoryEntry): number { return this.statsService.nailed(s); }
  sessionStruggled(s: ReviewSessionHistoryEntry): number { return this.statsService.struggled(s); }
  sessionDuration(s: ReviewSessionHistoryEntry): string { return this.statsService.formatDuration(s); }
  sessionDot(s: ReviewSessionHistoryEntry): string { return this.statsService.dotColour(s); }

  goBack(): void {
    this.location.back();
  }
}
