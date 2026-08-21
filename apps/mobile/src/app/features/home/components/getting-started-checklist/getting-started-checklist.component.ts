import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CardStore } from '../../../vault/store/card.store';
import { SettingsStore } from '../../../settings/store/settings.store';
import { ReviewStore } from '../../../review/store/review.store';
import { StoryStore } from '../../../stories/store/story.store';

interface ChecklistItem {
  labelKey: string;
  completed: boolean;
  route: string;
}

export function nextIncompleteChecklistItem(items: readonly ChecklistItem[]): ChecklistItem | null {
  return items.find(item => !item.completed) ?? null;
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
  private readonly storyStore = inject(StoryStore);
  private readonly router = inject(Router);

  readonly items = computed<ChecklistItem[]>(() => {
    const hasCards = this.cardStore.cards().length > 0;
    const hasGoals = this.settingsStore.settings()?.goalsSetAt !== null;
    const hasReviewed = this.reviewStore.sessionHistory().length > 0;
    const hasOpenedStory = Object.keys(this.storyStore.lastOpenedAt()).length > 0;

    return [
      { labelKey: 'onboarding.checklist.addWord', completed: hasCards, route: '/vault' },
      { labelKey: 'onboarding.checklist.setGoal', completed: hasGoals, route: '/settings/goals' },
      { labelKey: 'onboarding.checklist.firstReview', completed: hasReviewed, route: '/review' },
      { labelKey: 'onboarding.checklist.tryStory', completed: hasOpenedStory, route: '/stories' },
    ];
  });

  readonly nextItem = computed(() => nextIncompleteChecklistItem(this.items()));

  readonly visible = computed(() => {
    const settings = this.settingsStore.settings();
    if (!settings || settings.onboardingCompletedAt === null) return false;
    return this.nextItem() !== null;
  });

  navigate(route: string): void {
    this.router.navigateByUrl(route);
  }
}
