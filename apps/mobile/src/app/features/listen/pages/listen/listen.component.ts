import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, ModalController, ViewWillEnter } from '@ionic/angular/standalone';
import { Card } from '@lingua-card/shared/domain';
import { CategoryStore } from '../../../vault/store/category.store';
import { CollectionStore } from '../../../vault/store/collection.store';
import { ListenStore } from '../../store/listen.store';
import { ArticleBadgeComponent } from '../../../../shared/components/article-badge/article-badge.component';
import { WordAudioService } from '../../../../shared/audio/word-audio.service';
import { PlaylistSourceSheetComponent } from '../../components/playlist-source-sheet/playlist-source-sheet.component';

@Component({
  selector: 'lc-listen',
  templateUrl: './listen.component.html',
  styleUrls: ['./listen.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonHeader, IonToolbar, ArticleBadgeComponent],
})
export class ListenComponent implements OnInit, ViewWillEnter {
  private readonly listenStore  = inject(ListenStore);
  private readonly categoryStore = inject(CategoryStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly modalCtrl    = inject(ModalController);
  private readonly router       = inject(Router);
  private readonly route        = inject(ActivatedRoute);
  private readonly wordAudio    = inject(WordAudioService);

  // ── Store signals (single source of truth) ────────────────────────────────
  readonly queue            = this.listenStore.queue;
  readonly sourceLabel      = this.listenStore.sourceLabel;
  readonly playMode         = this.listenStore.playMode;
  readonly speed            = this.listenStore.speed;
  readonly estimatedMinutes = this.listenStore.estimatedMinutes;
  readonly categories       = this.categoryStore.categories;

  readonly queueCount = computed(() => this.queue().length);

  readonly MODES = [
    { value: 'compact'  as const, label: 'Compact',   desc: 'Word + meaning' },
    { value: 'examples' as const, label: 'Examples',  desc: 'Full sentences' },
    { value: 'deepDive' as const, label: 'Deep dive', desc: '+ grammar tip'  },
  ];

  readonly SPEEDS = [0.75 as const, 1 as const, 1.25 as const, 1.5 as const];

  getCategoryLabel(card: Card): string {
    return this.categories().find(c => card.categoryIds.includes(c.id))?.name ?? '';
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void { /* handled in ionViewWillEnter */ }

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

  // ── Source sheet ──────────────────────────────────────────────────────────

  async openSourceSheet(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: PlaylistSourceSheetComponent,
      breakpoints: [0, 1],
      initialBreakpoint: 1,
      handle: false,
      cssClass: 'pss-modal',
    });
    await modal.present();
  }

  // ── Playback ──────────────────────────────────────────────────────────────

  play(): void {
    this.listenStore.start({ shuffle: false });
    this.router.navigate(['/listen/now-playing']);
  }

  shuffle(): void {
    this.listenStore.start({ shuffle: true });
    this.router.navigate(['/listen/now-playing']);
  }

  setMode(mode: 'compact' | 'examples' | 'deepDive'): void {
    this.listenStore.updateSettings({ playMode: mode });
  }

  setSpeed(speed: 0.75 | 1 | 1.25 | 1.5): void {
    this.listenStore.updateSettings({ speed });
  }

  playCardAudio(card: Card): void {
    void this.wordAudio.playCard(card);
  }
}
