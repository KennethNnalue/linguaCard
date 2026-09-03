import { ChangeDetectionStrategy, Component, ElementRef, inject, OnInit, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, libraryOutline, play, schoolOutline } from 'ionicons/icons';
import { ReviewPlayerService } from '../../../review/services/review-player.service';
import { PodcastCatalogueStore } from '../../store/podcast-catalogue.store';
import { CardStore } from '../../../vault/store/card.store';
import { CollectionStore } from '../../../vault/store/collection.store';
import { VaultV2Store } from '../../../vault/store/vault-v2.store';
import { OfflineImageDirective } from '../../../../shared/image/offline-image.directive';

@Component({
  selector: 'lc-podcast-preparation', standalone: true,
  imports: [IonButton, IonContent, IonIcon, IonSpinner, OfflineImageDirective],
  providers: [PodcastCatalogueStore], templateUrl: './podcast-preparation.page.html',
  styleUrls: ['./podcast-preparation.page.scss', './podcast-preparation-actions.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PodcastPreparationPage implements OnInit {
  readonly store = inject(PodcastCatalogueStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly reviewPlayer = inject(ReviewPlayerService);
  private readonly cardStore = inject(CardStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly vaultStore = inject(VaultV2Store);
  private readonly wordList = viewChild<ElementRef<HTMLElement>>('wordList');
  constructor() {
    addIcons({ arrowBackOutline, libraryOutline, play, schoolOutline });
  }
  ngOnInit(): void { this.store.loadPreparation(this.route.snapshot.paramMap.get('episodeId') ?? ''); }
  goBack(topicId: string): void { void this.router.navigate(['/podcasts/topics', topicId]); }
  listenNow(): void {
    const episodeId = this.store.preparation()?.episode.id;
    if (episodeId) void this.router.navigate(['/podcasts/episodes', episodeId, 'player'], {
      queryParams: { autoplay: '1' },
    });
  }
  async reviewWords(): Promise<void> {
    const preparation = this.store.preparation();
    if (!preparation?.readiness.learnFirstCount) {
      this.wordList()?.nativeElement.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const collectionId = await this.store.prepareSuggestedVocabulary(preparation.episode.id);
    if (!collectionId) return;
    await this.refreshVaultState();
    await this.reviewPlayer.openSource(
      { kind: 'collection', collectionId }, preparation.readiness.learnFirstCount,
    );
  }
  async prepareWords(episodeId: string): Promise<void> {
    const collectionId = await this.store.prepareSuggestedVocabulary(episodeId);
    if (collectionId) await this.refreshVaultState();
  }
  async openPreparedCollection(): Promise<void> {
    const collectionId = this.store.preparationCollectionId();
    if (!collectionId) return;
    await this.refreshVaultState();
    await this.router.navigate(['/vault/collections', collectionId]);
  }

  private async refreshVaultState(): Promise<void> {
    this.collectionStore.loadCollections();
    this.vaultStore.reset();
    this.vaultStore.ensureActiveVault();
    await this.cardStore.loadCards();
  }
}
