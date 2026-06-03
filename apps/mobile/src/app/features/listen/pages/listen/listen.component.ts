import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, ModalController, ViewWillEnter } from '@ionic/angular/standalone';
import { Card, PlayMode } from '@lingua-card/shared/domain';
import { CategoryStore } from '../../../vault/store/category.store';
import { CollectionStore } from '../../../vault/store/collection.store';
import { ListenStore } from '../../store/listen.store';
import { ArticleBadgeComponent } from '../../../../shared/components/article-badge/article-badge.component';
import { WordAudioService } from '../../../../shared/audio/word-audio.service';
import { PlaylistSourceSheetComponent } from '../../components/playlist-source-sheet/playlist-source-sheet.component';
import {
  LISTEN_SPEEDS_EXTENDED,
  PLAY_MODE_OPTIONS,
  PLAYLIST_SOURCE_SHEET_CSS_CLASS,
  PlaybackSpeed,
} from '../../models/listen.models';

@Component({
  selector: 'lc-listen',
  templateUrl: './listen.component.html',
  styleUrl: './listen.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonHeader, IonToolbar, ArticleBadgeComponent],
})
export class ListenComponent implements ViewWillEnter {
  protected readonly listenStore = inject(ListenStore);
  protected readonly categoryStore = inject(CategoryStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly modalCtrl = inject(ModalController);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly wordAudio = inject(WordAudioService);

  readonly MODES = PLAY_MODE_OPTIONS;
  readonly SPEEDS = LISTEN_SPEEDS_EXTENDED;

  readonly queueCount = computed(() => this.listenStore.queue().length);

  getCategoryLabel(card: Card): string {
    return this.categoryStore.categories().find(c => card.categoryIds.includes(c.id))?.name ?? '';
  }

  ionViewWillEnter(): void {
    const params = this.route.snapshot.queryParamMap;
    const collectionId = params.get('collectionId');
    if (collectionId) {
      const colName = params.get('collectionName')
        ?? this.collectionStore.collections().find(c => c.id === collectionId)?.name
        ?? 'Collection';
      this.listenStore.loadCollectionCards(collectionId, colName);
      this.router.navigate([], { replaceUrl: true, queryParams: {} });
    }
  }

  async openSourceSheet(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: PlaylistSourceSheetComponent,
      breakpoints: [0, 1],
      initialBreakpoint: 1,
      handle: false,
      cssClass: PLAYLIST_SOURCE_SHEET_CSS_CLASS,
    });
    await modal.present();
  }

  play(): void {
    this.listenStore.start({ shuffle: false });
    this.router.navigate(['/listen/now-playing']);
  }

  shuffle(): void {
    this.listenStore.start({ shuffle: true });
    this.router.navigate(['/listen/now-playing']);
  }

  setMode(mode: PlayMode): void {
    this.listenStore.updateSettings({ playMode: mode });
  }

  setSpeed(speed: PlaybackSpeed): void {
    this.listenStore.updateSettings({ speed });
  }

  playCardAudio(card: Card): void {
    void this.wordAudio.playCard(card);
  }
}
