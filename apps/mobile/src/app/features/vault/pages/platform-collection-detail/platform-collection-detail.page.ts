import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonContent,
  IonIcon,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { volumeHighOutline } from 'ionicons/icons';
import type {
  PlatformCollectionDetail,
  PlatformCollectionWordView,
} from '@lingua-card/shared/domain';
import { PlatformCollectionStore } from '../../store/platform-collection.store';
import { ArticleBadgeComponent } from '../../../../shared/components/article-badge/article-badge.component';
import { WordAudioService } from '../../../../shared/audio/word-audio.service';
import { GenerateStorySheetComponent } from '../../../stories/components/generate-story-sheet/generate-story-sheet.component';

@Component({
  selector: 'lc-platform-collection-detail',
  templateUrl: './platform-collection-detail.page.html',
  styleUrls: ['./platform-collection-detail.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonIcon, ArticleBadgeComponent, TranslatePipe],
})
export class PlatformCollectionDetailPage {
  private readonly router = inject(Router);
  private readonly modalCtrl = inject(ModalController);
  private readonly toastCtrl = inject(ToastController);
  private readonly translate = inject(TranslateService);
  private readonly platformStore = inject(PlatformCollectionStore);
  private readonly wordAudio = inject(WordAudioService);

  readonly alreadyKnownExpanded = signal(false);

  private readonly collectionId: string =
    inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  readonly detail = computed((): PlatformCollectionDetail | null =>
    this.platformStore.detailCache()[this.collectionId] ?? null,
  );

  readonly isLoading = this.platformStore.detailLoading;
  readonly adoptingId = this.platformStore.adoptingId;

  readonly newWords = computed((): PlatformCollectionWordView[] =>
    this.detail()?.words.filter(w => !w.knownToUser) ?? [],
  );

  readonly knownWords = computed((): PlatformCollectionWordView[] =>
    this.detail()?.words.filter(w => w.knownToUser) ?? [],
  );

  readonly newCount = computed(() => this.newWords().length);
  readonly knownCount = computed(() => this.knownWords().length);

  /** Cover gradient — deterministic per id, matching the Vault Explore cards. */
  readonly coverClass = computed(() => {
    const id = this.collectionId;
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
    return `cover-${(Math.abs(hash) % 6) + 1}`;
  });

  playWord(w: PlatformCollectionWordView): void {
    const text = (w.article ? `${w.article} ` : '') + w.displayText;
    void this.wordAudio.play(text, 'de-DE');
  }

  constructor() {
    addIcons({ volumeHighOutline });
    if (!this.platformStore.detailCache()[this.collectionId]) {
      this.platformStore.loadDetail(this.collectionId);
    }

    effect(() => {
      const ev = this.platformStore.lastAdoptEvent();
      if (!ev) return;
      if (ev.type === 'success') {
        const count = ev.result.addedCount;
        void this._toast(
          count > 0 ? this.translate.instant('platformCollectionDetail.adopt.successMessage', { count }) : this.translate.instant('platformCollectionDetail.adopt.alreadyInMessage'),
          'success',
        );
        if (this._pendingGenerateAfterAdopt) {
          this._pendingGenerateAfterAdopt = false;
          void this._openGenerateSheet(ev.result.collection.id);
        }
      } else {
        this._pendingGenerateAfterAdopt = false;
        void this._toast(this.translate.instant('platformCollectionDetail.adopt.errorMessage'), 'danger');
      }
    });
  }

  goBack(): void { this.router.navigate(['/vault'], { queryParams: { view: 'explore' } }); }

  openStory(storyId: string): void {
    this.router.navigate(['/stories/platform', storyId]);
  }

  openAdoptedCollection(collectionId: string): void {
    this.router.navigate(['/vault/collections', collectionId]);
  }

  adoptCollection(): void {
    const d = this.detail();
    if (!d || this.adoptingId()) return;
    this.platformStore.adopt(d.id);
  }

  async generateStory(): Promise<void> {
    const d = this.detail();
    if (!d) return;

    if (d.adoptionStatus === 'adopted') {
      await this._openGenerateSheet(d.adoptedCollectionId!);
      return;
    }

    // Adopt first (fast — DB only), then open sheet when lastAdoptEvent fires.
    // We set a one-shot effect watcher via a local flag to avoid double-opening.
    this._pendingGenerateAfterAdopt = true;
    this.platformStore.adopt(d.id);
  }

  private _pendingGenerateAfterAdopt = false;

  private async _openGenerateSheet(collectionId: string): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: GenerateStorySheetComponent,
      breakpoints: [0, 0.92],
      initialBreakpoint: 0.92,
      handleBehavior: 'cycle',
      componentProps: { preselectedCollectionId: collectionId },
    });
    await modal.present();
  }

  private async _toast(message: string, color: 'success' | 'danger'): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 3500, color, position: 'bottom' });
    await t.present();
  }
}
