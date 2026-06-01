import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NavController, IonContent, IonHeader, IonIcon, IonToolbar, IonRange, ToastController, ActionSheetController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronBackOutline, chevronDownOutline } from 'ionicons/icons';
import { MasteryLevel } from '../../../../core/models/mock-data';
import { CollectionStore } from '../../../vault/store/collection.store';
import { ReviewStore } from '../../store/review.store';
import { ReviewFilterService, ReviewFilters } from '../../services/review-filter.service';
import { FormsModule } from '@angular/forms';

const MASTERY_INFO: { level: MasteryLevel; label: string; colour: string }[] = [
  { level: 0, label: 'New', colour: '#D1D5DB' },
  { level: 1, label: 'Beginner', colour: '#FCA5A5' },
  { level: 2, label: 'Learning', colour: '#FCD34D' },
  { level: 3, label: 'Familiar', colour: '#6EE7B7' },
  { level: 4, label: 'Good', colour: '#34D399' },
  { level: 5, label: 'Mastered', colour: '#059669' },
];

const SORT_OPTIONS: { value: ReviewFilters['sortOrder']; label: string }[] = [
  { value: 'hardest', label: 'Hardest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'random', label: 'Random' },
  { value: 'due_date', label: 'Due date' },
];

@Component({
  selector: 'lc-custom-study',
  templateUrl: './custom-study.page.html',
  styleUrls: ['./custom-study.page.scss'],
  imports: [IonContent, IonHeader, IonToolbar, IonIcon, IonRange, FormsModule],
})
export class CustomStudyPage {
  private readonly filterService = inject(ReviewFilterService);
  private readonly reviewStore = inject(ReviewStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly navCtrl = inject(NavController);
  private readonly toastCtrl = inject(ToastController);
  private readonly actionSheetCtrl = inject(ActionSheetController);

  constructor() {
    addIcons({ chevronBackOutline, chevronDownOutline });
  }

  readonly masteryInfo = MASTERY_INFO;
  readonly sortOptions = SORT_OPTIONS;

  readonly source = signal<string>('all');
  readonly masteryLevels = signal<MasteryLevel[]>([0, 1, 2]);
  readonly sortOrder = signal<ReviewFilters['sortOrder']>('hardest');
  readonly limit = signal<number>(30);

  readonly filters = computed<ReviewFilters>(() => ({
    source: this.source(),
    masteryLevels: this.masteryLevels(),
    sortOrder: this.sortOrder(),
    limit: this.limit(),
  }));

  readonly matchingCount = computed(() => {
    if (!this.masteryLevels().length) return 0;
    return this.filterService.buildQueue({ ...this.filters(), limit: 9999 }).length;
  });

  readonly sessionCount = computed(() => Math.min(this.matchingCount(), this.limit()));

  readonly sourceLabel = computed(() => {
    const id = this.source();
    if (id === 'all') return '📚 All collections';
    const col = this.collectionStore.collections().find(c => c.id === id);
    return col ? `${col.emoji ?? '📚'} ${col.name}` : 'All collections';
  });

  readonly masteryCountMap = computed(() => {
    const dist = this.filterService.getMasteryDistribution(
      this.source() !== 'all' ? this.source() : undefined
    );
    return dist;
  });

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

  setSortOrder(order: ReviewFilters['sortOrder']): void {
    this.sortOrder.set(order);
  }

  onLimitChange(event: CustomEvent): void {
    this.limit.set(event.detail.value as number);
  }

  async openSourcePicker(): Promise<void> {
    const collections = this.collectionStore.collections();
    const actionSheet = await this.actionSheetCtrl.create({
      header: 'Select source',
      buttons: [
        {
          text: '📚 All collections',
          handler: () => this.source.set('all'),
        },
        ...collections.map(col => ({
          text: `${col.emoji ?? '📚'} ${col.name}`,
          handler: () => this.source.set(col.id),
        })),
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await actionSheet.present();
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
    this.reviewStore.startSession(queue, this.source() !== 'all' ? this.source() : null, 'Custom study');
    void this.navCtrl.navigateForward('/review/player');
  }

  goBack(): void {
    this.navCtrl.back();
  }
}
