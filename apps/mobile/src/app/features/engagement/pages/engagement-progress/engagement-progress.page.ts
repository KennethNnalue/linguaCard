import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Location } from '@angular/common';
import { IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { chevronBackOutline, flameOutline, snowOutline } from 'ionicons/icons';
import { EngagementDayView, EngagementDayViewStatus } from '../../models/engagement-view.models';
import { EngagementStore } from '../../state/engagement.store';

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
  imports: [IonContent, IonHeader, IonIcon, IonToolbar, TranslatePipe],
})
export class EngagementProgressPage {
  private readonly engagementStore = inject(EngagementStore);
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
