import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { IonContent, IonHeader, IonIcon, IonToolbar, ModalController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkOutline, closeOutline } from 'ionicons/icons';
import { TranslatePipe } from '@ngx-translate/core';
import { CardStore } from '../../../vault/store/card.store';
import { CollectionStore } from '../../../vault/store/collection.store';

@Component({
  selector: 'lc-collection-picker-sheet',
  templateUrl: './collection-picker-sheet.component.html',
  styleUrls: ['./collection-picker-sheet.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonHeader, IonToolbar, IonIcon, TranslatePipe],
})
export class CollectionPickerSheetComponent implements OnInit {
  private readonly cardStore = inject(CardStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly modalCtrl = inject(ModalController);

  /** Set via modal componentProps — the caller's current selection. */
  initialSelectedIds: string[] = [];

  /**
   * Set via modal componentProps — called live on every change so the selection
   * reflects in the host no matter how the sheet is closed (Done, swipe-down, or
   * backdrop), not only on an explicit dismiss-with-result.
   */
  onSelectionChange?: (ids: string[]) => void;

  readonly selectedIds = signal<Set<string>>(new Set<string>());

  readonly options = computed(() => {
    const counts = new Map<string, number>();
    for (const c of this.cardStore.cards()) {
      if (c.collectionId) counts.set(c.collectionId, (counts.get(c.collectionId) ?? 0) + 1);
    }
    return this.collectionStore
      .collections()
      .map(col => ({ id: col.id, name: col.name, emoji: col.emoji ?? '📚', count: counts.get(col.id) ?? 0 }))
      .filter(c => c.count > 0);
  });

  readonly isAll = computed(() => this.selectedIds().size === 0);

  constructor() {
    addIcons({ checkmarkOutline, closeOutline });
  }

  ngOnInit(): void {
    this.selectedIds.set(new Set(this.initialSelectedIds));
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  selectAll(): void {
    this.selectedIds.set(new Set<string>());
    this.emitChange();
  }

  toggle(id: string): void {
    const next = new Set(this.selectedIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedIds.set(next);
    this.emitChange();
  }

  dismiss(): void {
    void this.modalCtrl.dismiss(null);
  }

  private emitChange(): void {
    this.onSelectionChange?.([...this.selectedIds()]);
  }
}
