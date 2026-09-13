import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { AlertController, IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { chevronBackOutline, flameOutline, snowOutline } from 'ionicons/icons';
import { EngagementDayView, EngagementDayViewStatus } from '../../models/engagement-view.models';
import { EngagementStore } from '../../state/engagement.store';
import { ReviewStore } from '../../../review/store/review.store';
import { SessionStatsService } from '../../../review/shared/services/session-stats.service';
import { SessionDatePipe } from '../../../review/shared/pipes/session-date.pipe';
import { ReviewSessionHistoryEntry } from '../../../review/models/review.model';
import { reviewHistoryCutoff } from '@lingua-card/shared/utils';

const STATUS_LABEL_KEYS: Readonly<Record<EngagementDayViewStatus, string>> = {
  goal_met: 'review.engagement.progress.goalMet',
  protected_by_freeze: 'review.engagement.progress.protected',
  missed: 'review.engagement.progress.missed',
  open: 'review.engagement.progress.open',
  untracked: 'review.engagement.progress.untracked',
};

@Component({
  selector: 'lc-engagement-progress',
  templateUrl: './engagement-progress.page.html',
  styleUrls: ['./engagement-progress.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonHeader, IonIcon, IonToolbar, TranslatePipe, SessionDatePipe],
})
export class EngagementProgressPage {
  private readonly engagementStore = inject(EngagementStore);
  private readonly reviewStore = inject(ReviewStore);
  private readonly stats = inject(SessionStatsService);
  private readonly alerts = inject(AlertController);
  private readonly translate = inject(TranslateService);
  private readonly location = inject(Location);

  constructor() {
    addIcons({ chevronBackOutline, flameOutline, snowOutline });
    if (this.loadState().status === 'idle') void this.engagementStore.loadEngagement();
  }

  readonly dashboard = this.engagementStore.dashboard;
  readonly days = this.engagementStore.recentDays;
  readonly loadState = this.engagementStore.loadState;
  readonly protectedDays = computed(() => this.days().filter(day => day.status === 'protected_by_freeze').length);
  readonly hasTrackedHistory = computed(() => this.days().some(day => day.status !== 'untracked' && day.status !== 'open'));
  readonly sessions = computed(() => this.reviewStore.sessionHistory()
    .filter(session => new Date(session.startedAt) >= reviewHistoryCutoff())
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt)));
  readonly clearingHistory = signal(false);
  readonly historyError = signal(false);

  sessionCards(session: ReviewSessionHistoryEntry): number {
    return session.reviewedCardIds.length;
  }

  sessionNailed(session: ReviewSessionHistoryEntry): number {
    return this.stats.nailed(session);
  }

  sessionStruggled(session: ReviewSessionHistoryEntry): number {
    return this.stats.struggled(session);
  }

  sessionDuration(session: ReviewSessionHistoryEntry): string {
    return this.stats.formatDuration(session);
  }

  async confirmClearHistory(): Promise<void> {
    const alert = await this.alerts.create({
      header: this.translate.instant('review.engagement.progress.clearHistoryTitle'),
      message: this.translate.instant('review.engagement.progress.clearHistoryMessage'),
      buttons: [
        { text: this.translate.instant('common.cancel'), role: 'cancel' },
        {
          text: this.translate.instant('review.engagement.progress.clearHistory'),
          role: 'destructive',
          handler: () => { void this.clearHistory(); },
        },
      ],
    });
    await alert.present();
  }

  private async clearHistory(): Promise<void> {
    this.clearingHistory.set(true);
    this.historyError.set(false);
    try {
      await this.reviewStore.clearHistory();
    } catch {
      this.historyError.set(true);
    } finally {
      this.clearingHistory.set(false);
    }
  }

  dayNumber(day: EngagementDayView): string {
    return day.dayKey.slice(-2).replace(/^0/, '');
  }

  statusLabelKey(status: EngagementDayViewStatus): string {
    return STATUS_LABEL_KEYS[status];
  }

  retry(): void {
    void this.engagementStore.loadEngagement();
  }

  goBack(): void {
    this.location.back();
  }
}
