import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CollectionStore } from '../../../vault/store/collection.store';
import { ListenStore } from '../../store/listen.store';

@Component({
  selector: 'lc-playlist-source-sheet',
  templateUrl: './playlist-source-sheet.component.html',
  styleUrl: './playlist-source-sheet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, TranslatePipe],
})
export class PlaylistSourceSheetComponent {
  protected readonly listenStore = inject(ListenStore);
  protected readonly collectionStore = inject(CollectionStore);
  private readonly modalCtrl = inject(ModalController);
  private readonly translate = inject(TranslateService);

  readonly showCollections = signal(false);

  // H2 fix: replace plain-method isActive/isCollectionActive calls in bindings with a
  // single computed that maps the active source key — template uses it directly
  readonly activeSource = computed(() => this.listenStore.selectedSource());

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
    const col = this.collectionStore.collections().find(c => c.id === id);
    const prefix = this.translate.instant('listen.card.collectionPrefix');
    const label = `${prefix} ${col?.name ?? 'Collection'}`;
    this.listenStore.loadCollectionCards(id, label);
    this.dismiss();
  }

  dismiss(): void {
    void this.modalCtrl.dismiss();
  }
}
