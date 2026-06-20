import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CardStore } from '../../../vault/store/card.store';
import { SettingsStore } from '../../../settings/store/settings.store';
import { ReviewStore } from '../../../review/store/review.store';

const DISMISSED_KEY = 'lc_onboarding_checklist_dismissed';
const STORY_OPENED_KEY = 'lc_onboarding_story_opened';

interface ChecklistItem {
  labelKey: string;
  done: boolean;
  route: string;
}

@Component({
  selector: 'lc-getting-started-checklist',
  templateUrl: './getting-started-checklist.component.html',
  styleUrls: ['./getting-started-checklist.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
})
export class GettingStartedChecklistComponent {
  private readonly cardStore = inject(CardStore);
  private readonly settingsStore = inject(SettingsStore);
  private readonly reviewStore = inject(ReviewStore);
  private readonly router = inject(Router);

  readonly dismissed = signal(localStorage.getItem(DISMISSED_KEY) === 'true');
  readonly storyOpened = signal(localStorage.getItem(STORY_OPENED_KEY) === 'true');

  readonly items = computed<ChecklistItem[]>(() => {
    const hasCards = this.cardStore.cards().length > 0;
    const hasGoals = this.settingsStore.settings()?.goalsSetAt !== null;
    const hasReviewed = this.reviewStore.sessionHistory().length > 0;
    const hasStory = this.storyOpened();

    return [
      { labelKey: 'onboarding.checklist.addWord', done: hasCards, route: '/vault' },
      { labelKey: 'onboarding.checklist.setGoal', done: hasGoals, route: '/settings/goals' },
      { labelKey: 'onboarding.checklist.firstReview', done: hasReviewed, route: '/review' },
      { labelKey: 'onboarding.checklist.tryStory', done: hasStory, route: '/stories' },
    ];
  });

  readonly doneCount = computed(() => this.items().filter(i => i.done).length);
  readonly totalCount = computed(() => this.items().length);
  readonly allDone = computed(() => this.doneCount() === this.totalCount());

  readonly visible = computed(() => {
    if (this.dismissed()) return false;
    const settings = this.settingsStore.settings();
    if (!settings || settings.onboardingCompletedAt === null) return false;
    return true;
  });

  navigate(route: string): void {
    this.router.navigateByUrl(route);
  }

  dismiss(): void {
    this.dismissed.set(true);
    localStorage.setItem(DISMISSED_KEY, 'true');
  }
}
