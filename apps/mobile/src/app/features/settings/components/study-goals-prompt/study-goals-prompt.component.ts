import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ModalController } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { SettingsStore } from '../../store/settings.store';
import { DEFAULT_STUDY_GOALS } from '@lingua-card/shared/domain';

@Component({
  selector: 'lc-study-goals-prompt',
  templateUrl: './study-goals-prompt.component.html',
  styleUrl: './study-goals-prompt.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
})
export class StudyGoalsPromptComponent {
  private readonly modalCtrl = inject(ModalController);
  private readonly router = inject(Router);
  private readonly settingsStore = inject(SettingsStore);

  readonly dailyGoal = computed(() => this.settingsStore.settings()?.dailyGoal ?? DEFAULT_STUDY_GOALS.dailyGoal);
  readonly weeklyGoal = computed(() => this.settingsStore.settings()?.weeklyGoal ?? DEFAULT_STUDY_GOALS.weeklyGoal);
  readonly monthlyGoal = computed(() => this.settingsStore.settings()?.monthlyGoal ?? DEFAULT_STUDY_GOALS.monthlyGoal);

  readonly isFirstTime = computed(() => this.settingsStore.settings()?.goalsSetAt === null);

  async setGoals(): Promise<void> {
    await this.modalCtrl.dismiss({ action: 'set' });
    void this.router.navigate(['/settings/goals']);
  }

  async dismiss(): Promise<void> {
    await this.modalCtrl.dismiss({ action: 'skip' });
  }
}
