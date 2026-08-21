import {ChangeDetectionStrategy, Component, computed, inject} from '@angular/core';
import {Router} from '@angular/router';
import {IonContent, IonHeader, IonToolbar} from '@ionic/angular/standalone';
import {TranslatePipe} from '@ngx-translate/core';
import {SettingsStore} from '../../store/settings.store';
import {DEFAULT_STUDY_GOALS} from '@lingua-card/shared/domain';
import {estimateReviewMinutes} from '../../../../shared/review/estimate-review-time';

@Component({
  selector: 'lc-study-goals',
  templateUrl: './study-goals.page.html',
  styleUrl: './study-goals.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonHeader, IonToolbar, TranslatePipe],
})
export class StudyGoalsPage {
  private readonly settingsStore = inject(SettingsStore);
  private readonly router = inject(Router);

  readonly dailyGoal = computed(() => this.settingsStore.settings()?.dailyGoal ?? DEFAULT_STUDY_GOALS.dailyGoal);
  readonly weeklyGoal = computed(() => this.settingsStore.settings()?.weeklyGoal ?? DEFAULT_STUDY_GOALS.weeklyGoal);
  readonly monthlyGoal = computed(() => this.settingsStore.settings()?.monthlyGoal ?? DEFAULT_STUDY_GOALS.monthlyGoal);
  readonly updateStatus = this.settingsStore.updateStatus;

  readonly dailyChips = [10, 20, 30];
  readonly weeklyChips = [120, 300, 500, 700, 1000];
  readonly monthlyChips = [400, 800, 1200, 1500, 3000];
  readonly dailyEstimateMinutes = computed(() => estimateReviewMinutes({
    newCards: 0, reviewCards: this.dailyGoal(), mode: 'type',
  }));

  dailyGoalLabelKey(value: number): string {
    return value === 10 ? 'settings.goals.daily.light' : value === 20 ? 'settings.goals.daily.regular' : 'settings.goals.daily.focused';
  }

  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  goBack(): void {
    void this.router.navigate(['/home']);
  }

  setDailyGoal(value: number): void {
    this.debouncedUpdate({dailyGoal: Math.max(1, Math.min(500, value))});
  }

  setWeeklyGoal(value: number): void {
    this.debouncedUpdate({weeklyGoal: Math.max(1, Math.min(2000, value))});
  }

  setMonthlyGoal(value: number): void {
    this.debouncedUpdate({monthlyGoal: Math.max(1, Math.min(5000, value))});
  }

  private debouncedUpdate(patch: Parameters<typeof this.settingsStore.update>[0]): void {
    // Immediate optimistic update
    void this.settingsStore.update(patch);
  }
}
