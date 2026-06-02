import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';
import { CollectionStore } from '../../../vault/store/collection.store';
import { ListenSourceKey, ListenStore } from '../../store/listen.store';

@Component({
  selector: 'lc-playlist-source-sheet',
  templateUrl: './playlist-source-sheet.component.html',
  styleUrls: ['./playlist-source-sheet.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent],
})
export class PlaylistSourceSheetComponent {
  private readonly listenStore = inject(ListenStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly modalCtrl = inject(ModalController);

  // All counts from the store — single source of truth
  readonly selectedSource  = this.listenStore.selectedSource;
  readonly dueCount        = this.listenStore.dueCount;
  readonly allCount        = this.listenStore.allCount;
  readonly strugglingCount = this.listenStore.strugglingCount;
  readonly collectionCounts = this.listenStore.collectionCounts;
  readonly collections     = this.collectionStore.collections;

  readonly showCollections = signal(false);

  isActive(src: ListenSourceKey): boolean {
    return this.selectedSource() === src;
  }

  isCollectionActive(id: string): boolean {
    return this.selectedSource() === `collection:${id}`;
  }

  collectionCount(id: string): number {
    return this.collectionCounts().get(id) ?? 0;
  }

  selectDue(): void {
    this.listenStore.loadDueCards();
    this.dismiss();
  }

  selectAll(): void {
    this.listenStore.loadAllCards();
    this.dismiss();
  }

  selectStruggling(): void {
    this.listenStore.loadStrugglingCards();
    this.dismiss();
  }

  toggleCollections(): void {
    this.showCollections.update(v => !v);
  }

  selectCollection(id: string): void {
    const col = this.collections().find(c => c.id === id);
    this.listenStore.loadCollectionCards(id, col?.name ?? 'Collection');
    this.dismiss();
  }

  dismiss(): void {
    void this.modalCtrl.dismiss();
  }
}
