import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NavController, IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronBackOutline, chevronDownOutline, playOutline } from 'ionicons/icons';
import { MasteryLevel } from '@lingua-card/shared/domain';
import { ReviewStore } from '../../store/review.store';
import { ReviewFilterService } from '../../services/review-filter.service';
import { SourcePickerService } from '../../shared/services/source-picker.service';
import {
  MASTERY_INFO_DESC,
  ReviewLimit,
  ReviewRoute,
  ReviewSortOrder,
  ReviewSource,
} from '../../models/review.model';

@Component({
  selector: 'lc-mastery-breakdown',
  templateUrl: './mastery-breakdown.page.html',
  styleUrls: ['./mastery-breakdown.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonHeader, IonToolbar, IonIcon],
})
export class MasteryBreakdownPage {
  private readonly filterService = inject(ReviewFilterService);
  private readonly reviewStore = inject(ReviewStore);
  private readonly sourcePicker = inject(SourcePickerService);
  private readonly navCtrl = inject(NavController);
  private readonly router = inject(Router);

  constructor() {
    addIcons({ chevronBackOutline, chevronDownOutline, playOutline });
  }

  readonly masteryRows = MASTERY_INFO_DESC;

  readonly selectedCollectionId = signal<string | undefined>(undefined);

  readonly sourceLabel = computed(() =>
    this.sourcePicker.labelFor(this.selectedCollectionId() ?? ReviewSource.ALL)
  );

  readonly distribution = computed(() =>
    this.filterService.getMasteryDistribution(this.selectedCollectionId())
  );

  readonly maxCount = computed(() =>
    Math.max(...Object.values(this.distribution()), 1)
  );

  barWidth(level: MasteryLevel): number {
    const count = this.distribution()[level] ?? 0;
    return Math.round((count / this.maxCount()) * 100);
  }

  count(level: MasteryLevel): number {
    return this.distribution()[level] ?? 0;
  }

  async openSourcePicker(): Promise<void> {
    const result = await this.sourcePicker.pick('Select collection');
    if (result === null) return;
    this.selectedCollectionId.set(result === ReviewSource.ALL ? undefined : result);
  }

  reviewLevel(level: MasteryLevel): void {
    const source = this.selectedCollectionId() ?? ReviewSource.ALL;
    const queue = this.filterService.buildQueue({
      source,
      masteryLevels: [level],
      sortOrder: ReviewSortOrder.RANDOM,
      limit: ReviewLimit.MASTERY_LEVEL,
    });
    if (!queue.length) return;
    const label = MASTERY_INFO_DESC.find(r => r.level === level)?.label ?? null;
    this.reviewStore.startSession(queue, source !== ReviewSource.ALL ? source : null, label);
    void this.navCtrl.navigateForward(ReviewRoute.PLAYER);
  }

  goBack(): void {
    void this.router.navigate([ReviewRoute.HUB]);
  }
}
