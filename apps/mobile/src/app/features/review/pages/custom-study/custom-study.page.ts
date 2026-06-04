import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NavController, IonContent, IonHeader, IonIcon, IonToolbar, IonRange, ToastController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronBackOutline, chevronDownOutline } from 'ionicons/icons';
import { MasteryLevel } from '@lingua-card/shared/domain';
import { ReviewStore } from '../../store/review.store';
import { ReviewFilterService } from '../../services/review-filter.service';
import { SourcePickerService } from '../../shared/services/source-picker.service';
import { FormsModule } from '@angular/forms';
import {
  MASTERY_INFO,
  ReviewFilters,
  ReviewLimit,
  ReviewRoute,
  ReviewSortOrder,
  ReviewSource,
  SORT_OPTIONS,
} from '../../models/review.model';

@Component({
  selector: 'lc-custom-study',
  templateUrl: './custom-study.page.html',
  styleUrls: ['./custom-study.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonHeader, IonToolbar, IonIcon, IonRange, FormsModule],
})
export class CustomStudyPage {
  private readonly filterService = inject(ReviewFilterService);
  private readonly reviewStore = inject(ReviewStore);
  private readonly sourcePicker = inject(SourcePickerService);
  private readonly navCtrl = inject(NavController);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);

  constructor() {
    addIcons({ chevronBackOutline, chevronDownOutline });
  }

  readonly masteryInfo = MASTERY_INFO;
  readonly sortOptions = SORT_OPTIONS;

  readonly source = signal<string>(ReviewSource.ALL);
  readonly masteryLevels = signal<MasteryLevel[]>([0, 1, 2]);
  readonly sortOrder = signal<ReviewSortOrder>(ReviewSortOrder.HARDEST);
  readonly limit = signal<number>(ReviewLimit.CUSTOM_DEFAULT);

  readonly filters = computed<ReviewFilters>(() => ({
    source: this.source(),
    masteryLevels: this.masteryLevels(),
    sortOrder: this.sortOrder(),
    limit: this.limit(),
  }));

  readonly matchingCount = computed(() => {
    if (!this.masteryLevels().length) return 0;
    return this.filterService.buildQueue({ ...this.filters(), limit: ReviewLimit.CUSTOM_MAX }).length;
  });

  readonly sessionCount = computed(() => Math.min(this.matchingCount(), this.limit()));

  readonly sourceLabel = computed(() => this.sourcePicker.labelFor(this.source()));

  readonly masteryCountMap = computed(() =>
    this.filterService.getMasteryDistribution(
      this.source() !== ReviewSource.ALL ? this.source() : undefined
    )
  );

  isMasterySelected(level: MasteryLevel): boolean {
    return this.masteryLevels().includes(level);
  }

  toggleMastery(level: MasteryLevel): void {
    const current = this.masteryLevels();
    if (current.includes(level)) {
      this.masteryLevels.set(current.filter(l => l !== level));
    } else {
      this.masteryLevels.set([...current, level].sort() as MasteryLevel[]);
    }
  }

  setSortOrder(order: ReviewSortOrder): void {
    this.sortOrder.set(order);
  }

  onLimitChange(event: CustomEvent): void {
    this.limit.set(event.detail.value as number);
  }

  async openSourcePicker(): Promise<void> {
    const result = await this.sourcePicker.pick('Select source');
    if (result !== null) this.source.set(result);
  }

  async startSession(): Promise<void> {
    if (!this.masteryLevels().length || !this.sessionCount()) {
      const toast = await this.toastCtrl.create({
        message: 'No cards match your filters.',
        duration: 2000,
        position: 'bottom',
        color: 'warning',
      });
      await toast.present();
      return;
    }
    const queue = this.filterService.buildQueue(this.filters());
    this.reviewStore.startSession(queue, this.source() !== ReviewSource.ALL ? this.source() : null, 'Custom study');
    void this.navCtrl.navigateForward(ReviewRoute.PLAYER);
  }

  goBack(): void {
    void this.router.navigate([ReviewRoute.HUB]);
  }
}
