import { PodcastDiscoveryEventsService } from '../../services/podcast-discovery-events.service';
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline, closeOutline, documentTextOutline, libraryOutline, play, schoolOutline, volumeHighOutline } from 'ionicons/icons';
import type { PodcastPreparationVocabulary } from '@lingua-card/shared/domain';
import { TranslatePipe } from '@ngx-translate/core';
import { ReviewPlayerService } from '../../../review/services/review-player.service';
import { PodcastCatalogueStore } from '../../store/podcast-catalogue.store';
import { CardStore } from '../../../vault/store/card.store';
import { CollectionStore } from '../../../vault/store/collection.store';
import { VaultV2Store } from '../../../vault/store/vault-v2.store';
import { OfflineImageDirective } from '../../../../shared/image/offline-image.directive';
import { ArticleBadgeComponent } from '../../../../shared/components/article-badge/article-badge.component';
import { WordAudioService } from '../../../../shared/audio/word-audio.service';
import { PodcastTranscriptComponent } from '../../components/podcast-transcript/podcast-transcript.component';

@Component({
  selector: 'lc-podcast-preparation', standalone: true,
  imports: [ArticleBadgeComponent, IonButton, IonContent, IonIcon, IonSpinner, OfflineImageDirective, PodcastTranscriptComponent, TranslatePipe],
  providers: [PodcastCatalogueStore], templateUrl: './podcast-preparation.page.html',
  styleUrls: ['./podcast-preparation.page.scss', './podcast-preparation-actions.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PodcastPreparationPage {
  readonly store = inject(PodcastCatalogueStore);
  readonly wordsExpanded = signal(false);
  readonly allWordsShown = signal(false);
  readonly previewVocabulary = computed(() => {
    const words = this.store.essentialVocabulary();
    const saved = words.filter(word => word.isInVault);
    const newWords = words.filter(word => !word.isInVault);
    return [...saved, ...(this.allWordsShown() ? newWords : newWords.slice(0, 3))];
  });
  readonly transcriptOpen = signal(false);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly discoveryEvents = inject(PodcastDiscoveryEventsService);
  private readonly reviewPlayer = inject(ReviewPlayerService);
  private readonly cardStore = inject(CardStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly vaultStore = inject(VaultV2Store);
  private readonly wordAudio = inject(WordAudioService);
  private readonly wordList = viewChild<ElementRef<HTMLElement>>('wordList');
  constructor() {
    effect(() => {
      const heading = this.vocabularyHeading();
      if (this.previewFocusPending && this.wordsExpanded() && heading) {
        heading.nativeElement.focus();
        this.previewFocusPending = false;
      }
    });
    addIcons({ arrowBackOutline, closeOutline, documentTextOutline, libraryOutline, play, schoolOutline, volumeHighOutline });
  }
  private readonly vocabularyHeading = viewChild<ElementRef<HTMLElement>>('vocabularyHeading');
  private previewFocusPending = false;
  private returnedReviewRecorded = false;
  ionViewWillEnter(): void {
    const episodeId = this.route.snapshot.paramMap.get('episodeId') ?? '';
    this.previewFocusPending = this.route.snapshot.queryParamMap.get('preview') === 'words';
    this.wordsExpanded.set(this.previewFocusPending);
    this.allWordsShown.set(false);
    this.store.loadPreparation(episodeId);
    if (episodeId && this.route.snapshot.queryParamMap.get('fromReview') === '1' && !this.returnedReviewRecorded) {
      this.discoveryEvents.record({ name: 'preparation_review_returned', episodeId });
      this.returnedReviewRecorded = true;
    }
  }
  goBack(topicId: string): void { void this.router.navigate(['/podcasts/topics', topicId]); }
  listenNow(): void {
    const episodeId = this.store.preparation()?.episode.id;
    if (episodeId) void this.router.navigate(['/podcasts/episodes', episodeId, 'player'], {
      queryParams: { autoplay: '1' },
    });
  }
  openTranscript(): void {
    const episodeId = this.store.preparation()?.episode.id;
    if (!episodeId) return;
    this.transcriptOpen.set(true);
    this.store.loadTranscript(episodeId);
  }
  previewWords(): void {
    this.wordsExpanded.set(true);
    this.wordList()?.nativeElement.scrollIntoView({ behavior: 'smooth' });
  }
  closeTranscript(): void { this.transcriptOpen.set(false); }
  async reviewWords(): Promise<void> {
    const preparation = this.store.preparation();
    if (!preparation?.readiness.learnFirstCount) {
      this.wordList()?.nativeElement.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const collectionId = await this.store.prepareSuggestedVocabulary(preparation.episode.id);
    if (!collectionId) return;
    await this.refreshVaultState();
    this.discoveryEvents.record({ name: 'preparation_review_started', episodeId: preparation.episode.id });
    await this.reviewPlayer.openSource(
      { kind: 'collection', collectionId, continuation: { kind: 'podcast', episodeId: preparation.episode.id, title: preparation.episode.title } }, preparation.readiness.learnFirstCount,
    );
  }
  async prepareWords(episodeId: string): Promise<void> {
    const collectionId = await this.store.prepareSuggestedVocabulary(episodeId);
    if (collectionId) { await this.refreshVaultState(); this.discoveryEvents.refresh(); }
  }
  async openPreparedCollection(): Promise<void> {
    const collectionId = this.store.preparationCollectionId();
    if (!collectionId) return;
    await this.refreshVaultState();
    await this.router.navigate(['/vault/collections', collectionId]);
  }

  playVocabulary(item: PodcastPreparationVocabulary): void {
    const prep = this.store.preparation();
    const language = this.targetLocale(prep?.targetLanguage ?? 'de');
    const word = `${item.article ? `${item.article} ` : ''}${item.text}`;
    void this.wordAudio.playUsage(word, item.example?.target, language);
  }

  private async refreshVaultState(): Promise<void> {
    this.collectionStore.loadCollections();
    this.vaultStore.reset();
    this.vaultStore.ensureActiveVault();
    await this.cardStore.loadCards();
  }

  private targetLocale(language: string): string {
    const locales: Record<string, string> = { de: 'de-DE', en: 'en-US', es: 'es-ES', ar: 'ar-SA' };
    return locales[language] ?? language;
  }
}
