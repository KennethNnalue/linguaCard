import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, IonIcon, ModalController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, checkmarkOutline } from 'ionicons/icons';
import { Card } from '../../../../core/models/mock-data';
import { MockCategoryService } from '../../../../core/services/mock-services';
import { CardStore } from '../../../../core/store/card.store';

type SourceKey = 'due-today' | 'mastered' | 'struggling' | `category:${string}`;
type PlaylistMode = 'word-meaning' | 'examples-only' | 'deep-dive';

@Component({
  selector: 'app-playlist-source-sheet',
  templateUrl: './playlist-source-sheet.component.html',
  styleUrls: ['./playlist-source-sheet.component.scss'],
  imports: [IonContent, IonIcon],
})
export class PlaylistSourceSheetComponent {
  private readonly cardStore = inject(CardStore);
  private readonly categoryService = inject(MockCategoryService);
  private readonly modalCtrl = inject(ModalController);

  constructor() {
    addIcons({ closeOutline, checkmarkOutline });
  }

  readonly categories = this.categoryService.categories;
  readonly selectedSource = signal<SourceKey>('due-today');
  readonly playbackMode = signal<PlaylistMode>('word-meaning');

  readonly MODES: { value: PlaylistMode; label: string; desc: string }[] = [
    { value: 'word-meaning', label: 'Word + meaning', desc: 'Word then translation' },
    { value: 'examples-only', label: 'Examples only', desc: 'Full sentences' },
    { value: 'deep-dive', label: 'Deep dive', desc: 'Word + examples + tip' },
  ];

  readonly dueCount = computed(() => this.cardStore.dueCards().length);
  readonly masteredCount = computed(() => this.cardStore.masteredCount());

  readonly strugglingCount = computed(() =>
    this.cardStore.filteredCards().filter(c => (c.srsState?.lastRating ?? 5) <= 1).length
  );

  readonly dueMinutes = computed(() => Math.max(1, Math.ceil(this.dueCount() * 0.25)));
  readonly masteredMinutes = computed(() => Math.max(1, Math.ceil(this.masteredCount() * 0.25)));

  categoryCount(categoryId: string): number {
    return this.cardStore.filteredCards().filter(c => c.categoryIds.includes(categoryId)).length;
  }

  categoryMinutes(categoryId: string): number {
    return Math.max(1, Math.ceil(this.categoryCount(categoryId) * 0.25));
  }

  selectSource(key: SourceKey): void {
    this.selectedSource.set(key);
  }

  selectCategory(catId: string): void {
    this.selectedSource.set(`category:${catId}` as SourceKey);
  }

  isCategorySelected(catId: string): boolean {
    return this.selectedSource() === `category:${catId}`;
  }

  setMode(mode: PlaylistMode): void {
    this.playbackMode.set(mode);
  }

  async startListening(): Promise<void> {
    const source = this.selectedSource();
    let cards: Card[] = [];
    let label = '';

    if (source === 'due-today') {
      cards = this.cardStore.dueCards();
      label = "Today's due words";
    } else if (source === 'mastered') {
      cards = this.cardStore.filteredCards().filter(c => (c.srsState?.masteryLevel ?? 0) >= 4);
      label = 'All mastered words';
    } else if (source === 'struggling') {
      cards = this.cardStore.filteredCards().filter(c => (c.srsState?.lastRating ?? 5) <= 1);
      label = 'Struggling words';
    } else if (source.startsWith('category:')) {
      const catId = source.slice('category:'.length);
      cards = this.cardStore.filteredCards().filter(c => c.categoryIds.includes(catId));
      const catName = this.categories().find(c => c.id === catId)?.name ?? 'Category';
      label = `Category: ${catName}`;
    }

    await this.modalCtrl.dismiss({ cards, label, mode: this.playbackMode() });
  }

  async dismiss(): Promise<void> {
    await this.modalCtrl.dismiss(null);
  }
}
