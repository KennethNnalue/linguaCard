import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronBackOutline, volumeHighOutline } from 'ionicons/icons';
import type {
  PlatformCollectionDetail,
  PlatformCollectionWordView,
} from '@lingua-card/shared/domain';
import { PlatformCollectionStore, ringStyle } from '../../store/platform-collection.store';
import { GenerateStorySheetComponent } from '../../../stories/components/generate-story-sheet/generate-story-sheet.component';

@Component({
  selector: 'lc-platform-collection-detail',
  templateUrl: './platform-collection-detail.page.html',
  styleUrls: ['./platform-collection-detail.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonHeader, IonToolbar, IonContent, IonFooter, IonIcon],
})
export class PlatformCollectionDetailPage {
  private readonly router = inject(Router);
  private readonly modalCtrl = inject(ModalController);
  private readonly toastCtrl = inject(ToastController);
  private readonly platformStore = inject(PlatformCollectionStore);

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

  constructor() {
    addIcons({ chevronBackOutline, volumeHighOutline });
    if (!this.platformStore.detailCache()[this.collectionId]) {
      this.platformStore.loadDetail(this.collectionId);
    }

    effect(() => {
      const ev = this.platformStore.lastAdoptEvent();
      if (!ev) return;
      if (ev.type === 'success') {
        const count = ev.result.addedCount;
        void this._toast(
          count > 0 ? `${count} words added — audio included ✓` : 'Already in your sets',
          'success',
        );
        if (this._pendingGenerateAfterAdopt) {
          this._pendingGenerateAfterAdopt = false;
          void this._openGenerateSheet(ev.result.collection.id);
        }
      } else {
        this._pendingGenerateAfterAdopt = false;
        void this._toast('Could not add collection. Try again.', 'danger');
      }
    });
  }

  goBack(): void { this.router.navigate(['/vault/collections'], { queryParams: { segment: 'explore' } }); }

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

  readonly ringStyle = ringStyle;

  private async _toast(message: string, color: 'success' | 'danger'): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 3500, color, position: 'bottom' });
    await t.present();
  }
}
