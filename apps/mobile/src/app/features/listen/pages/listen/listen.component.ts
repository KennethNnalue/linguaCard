import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, ModalController, ViewWillEnter } from '@ionic/angular/standalone';
import { Card, PlayMode } from '@lingua-card/shared/domain';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CategoryStore } from '../../../vault/store/category.store';
import { CollectionStore } from '../../../vault/store/collection.store';
import { ListenStore } from '../../store/listen.store';
import { WordAudioService } from '../../../../shared/audio/word-audio.service';
import { EmptyStateComponent } from '../../../../shared/ui/empty-state/empty-state.component';
import { PlaylistSourceSheetComponent } from '../../components/playlist-source-sheet/playlist-source-sheet.component';
import { ListenEqualizerComponent } from '../../components/listen-equalizer/listen-equalizer.component';
import { ListenSpeedChipsComponent } from '../../components/listen-speed-chips/listen-speed-chips.component';
import { ListenModeSelectorComponent } from '../../components/listen-mode-selector/listen-mode-selector.component';
import { ListenQueueItemComponent } from '../../components/listen-queue-item/listen-queue-item.component';
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
  imports: [
    IonContent, IonHeader, IonToolbar, TranslatePipe,
    EmptyStateComponent,
    ListenEqualizerComponent,
    ListenSpeedChipsComponent,
    ListenModeSelectorComponent,
    ListenQueueItemComponent,
  ],
})
export class ListenComponent implements ViewWillEnter {
  protected readonly listenStore = inject(ListenStore);
  private readonly categoryStore = inject(CategoryStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly modalCtrl = inject(ModalController);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly wordAudio = inject(WordAudioService);
  private readonly translate = inject(TranslateService);

  readonly MODES = PLAY_MODE_OPTIONS;
  readonly SPEEDS = LISTEN_SPEEDS_EXTENDED;

  readonly queueCount = computed(() => this.listenStore.queue().length);

  /** i18n key of the active mode's label — used in the hero sub-line. */
  readonly modeLabelKey = computed(
    () => this.MODES.find(m => m.value === this.listenStore.playMode())?.labelKey ?? '',
  );

  constructor() {
    // Fix any untranslated collection labels from restored sessions.
    effect(() => {
      const sourceLabel = this.listenStore.sourceLabel();
      if (sourceLabel?.startsWith('Collection:') && !sourceLabel.includes(this.translate.instant('listen.card.collectionPrefix'))) {
        const collectionName = sourceLabel.substring('Collection:'.length).trim();
        const prefix = this.translate.instant('listen.card.collectionPrefix');
        this.listenStore.setSourceLabel(`${prefix} ${collectionName}`);
      }
    });
  }

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
      const prefix = this.translate.instant('listen.card.collectionPrefix');
      this.listenStore.loadCollectionCards(collectionId, `${prefix} ${colName}`);
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

  downloadOffline(): void {
    void this.listenStore.downloadQueueForOffline();
  }
}
