import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NavController, IonContent, IonHeader, IonIcon, IonToolbar, ActionSheetController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronBackOutline, chevronDownOutline, playOutline } from 'ionicons/icons';
import { MasteryLevel } from '../../../../core/models/mock-data';
import { CollectionStore } from '../../../vault/store/collection.store';
import { ReviewStore } from '../../store/review.store';
import { ReviewFilterService } from '../../services/review-filter.service';

const MASTERY_ROWS: { level: MasteryLevel; label: string; colour: string }[] = [
  { level: 5, label: 'Mastered', colour: '#059669' },
  { level: 4, label: 'Good', colour: '#34D399' },
  { level: 3, label: 'Familiar', colour: '#6EE7B7' },
  { level: 2, label: 'Learning', colour: '#FCD34D' },
  { level: 1, label: 'Beginner', colour: '#FCA5A5' },
  { level: 0, label: 'New', colour: '#D1D5DB' },
];

@Component({
  selector: 'lc-mastery-breakdown',
  templateUrl: './mastery-breakdown.page.html',
  styleUrls: ['./mastery-breakdown.page.scss'],
  imports: [IonContent, IonHeader, IonToolbar, IonIcon],
})
export class MasteryBreakdownPage {
  private readonly filterService = inject(ReviewFilterService);
  private readonly reviewStore = inject(ReviewStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly navCtrl = inject(NavController);
  private readonly router = inject(Router);
  private readonly actionSheetCtrl = inject(ActionSheetController);

  constructor() {
    addIcons({ chevronBackOutline, chevronDownOutline, playOutline });
  }

  readonly masteryRows = MASTERY_ROWS;

  readonly selectedCollectionId = signal<string | undefined>(undefined);

  readonly sourceLabel = computed(() => {
    const id = this.selectedCollectionId();
    if (!id) return '📚 All collections';
    const col = this.collectionStore.collections().find(c => c.id === id);
    return col ? `${col.emoji ?? '📚'} ${col.name}` : 'All collections';
  });

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
    const collections = this.collectionStore.collections();
    const actionSheet = await this.actionSheetCtrl.create({
      header: 'Select collection',
      buttons: [
        {
          text: '📚 All collections',
          handler: () => this.selectedCollectionId.set(undefined),
        },
        ...collections.map(col => ({
          text: `${col.emoji ?? '📚'} ${col.name}`,
          handler: () => this.selectedCollectionId.set(col.id),
        })),
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await actionSheet.present();
  }

  reviewLevel(level: MasteryLevel): void {
    const source = this.selectedCollectionId() ?? 'all';
    const queue = this.filterService.buildQueue({
      source,
      masteryLevels: [level],
      sortOrder: 'random',
      limit: 50,
    });
    if (!queue.length) return;
    this.reviewStore.startSession(queue, source !== 'all' ? source : null, MASTERY_ROWS.find(r => r.level === level)?.label ?? null);
    void this.navCtrl.navigateForward('/review/player');
  }

  goBack(): void {
    void this.router.navigate(['/review']);
  }
}
