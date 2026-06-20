import {Component, computed, inject, signal} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {toSignal} from '@angular/core/rxjs-interop';
import {map} from 'rxjs/operators';
import {AlertController, IonContent, IonHeader, IonIcon, IonToolbar, ModalController, NavController,} from '@ionic/angular/standalone';
import {TranslatePipe, TranslateService} from '@ngx-translate/core';
import {addIcons} from 'ionicons';
import {
  chevronBackOutline,
  chevronDownOutline,
  createOutline,
  ellipsisHorizontalOutline,
  playOutline,
  trashOutline,
  volumeHighOutline,
} from 'ionicons/icons';
import {LanguageService} from '../../../../core/services/language.service';
import {CardStore} from '../../store/card.store';
import {CategoryStore} from '../../store/category.store';
import {CollectionStore} from '../../store/collection.store';
import {CardApiService} from '../../services/card-api.service';
import {WordAudioService} from '../../../../shared/audio/word-audio.service';
import {AudioReadinessStore} from '../../../../shared/audio/audio-readiness.store';
import {ArticleBadgeComponent} from '../../../../shared/components/article-badge/article-badge.component';
import {AddWordSheetComponent} from '../../components/add-word-sheet/add-word-sheet.component';
import {QuickRateSheetComponent} from '../../components/quick-rate-sheet/quick-rate-sheet.component';
import {getCategoryName} from '../../../../shared/helpers/helpers';
import {normalizeForAudio} from '../../../../shared/audio/normalize';

@Component({
  selector: 'lc-word-detail',
  templateUrl: './word-detail.component.html',
  styleUrls: ['./word-detail.component.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonIcon, ArticleBadgeComponent, TranslatePipe],
})
export class WordDetailComponent {
  private readonly cardStore = inject(CardStore);
  private readonly categoryStore = inject(CategoryStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly cardApi = inject(CardApiService);
  private readonly wordAudio = inject(WordAudioService);
  private readonly audioReadiness = inject(AudioReadinessStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly alertCtrl = inject(AlertController);
  private readonly modalCtrl = inject(ModalController);
  private readonly navCtrl = inject(NavController);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);

  constructor() {
    addIcons({
      chevronBackOutline,
      chevronDownOutline,
      ellipsisHorizontalOutline,
      volumeHighOutline,
      playOutline,
      createOutline,
      trashOutline,
    });
  }

  private readonly cardId = toSignal(
    this.route.params.pipe(map((p) => p['id'] as string)),
    {initialValue: ''},
  );

  readonly card = computed(
    () => this.cardStore.cards().find((c) => c.id === this.cardId()) ?? null,
  );

  readonly categories = this.categoryStore.categories;

  readonly masteryLevel = computed(() => this.card()?.srsState?.masteryLevel ?? 0);


  // Used only for the SVG ring stroke — mastery colors are the same in both modes
  readonly masteryColor = computed(() =>
    ['var(--lc-mastery-0)', 'var(--lc-mastery-1)', 'var(--lc-mastery-2)',
     'var(--lc-mastery-3)', 'var(--lc-mastery-4)', 'var(--lc-mastery-5)'][this.masteryLevel()]
  );

  readonly masteryLabel = computed(() => {
    this.languageService.current(); // recompute on UI language change
    const state = this.card()?.srsState?.state;
    if (!state || state === 'new') return this.translate.instant('srs.masteryLabel.new');
    const key = {learning: 'srs.masteryLabel.learning', review: 'srs.masteryLabel.review', relearning: 'srs.masteryLabel.review', mastered: 'srs.masteryLabel.mastered'}[state];
    return key ? this.translate.instant(key) : this.translate.instant('srs.masteryLabel.new');
  });

  readonly masteryRingOffset = computed(() => {
    // Circumference for r=22: 2π*22 ≈ 138.23
    const circumference = 2 * Math.PI * 22;
    const progress = this.masteryLevel() / 5;
    return circumference * (1 - progress);
  });

  readonly nextReviewText = computed(() => {
    this.languageService.current(); // recompute on UI language change
    const nextDue = this.card()?.srsState?.nextDueAt;
    if (!nextDue) return '—';
    const days = Math.ceil((new Date(nextDue).getTime() - Date.now()) / 86_400_000);
    if (days <= 0) return this.translate.instant('wordDetail.nextReview.dueNow');
    if (days === 1) return this.translate.instant('wordDetail.nextReview.tomorrow');
    return this.translate.instant('wordDetail.nextReview.inDays', { days });
  });

  readonly lastReviewedText = computed(() => {
    this.languageService.current(); // recompute on UI language change
    const last = this.card()?.srsState?.lastReviewedAt;
    if (!last) return this.translate.instant('wordDetail.lastReviewed.never');
    const days = Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000);
    if (days === 0) return this.translate.instant('wordDetail.lastReviewed.today');
    return this.translate.instant('wordDetail.lastReviewed.daysAgo', { days });
  });

  readonly stabilityLabel = computed(() => {
    const s = this.card()?.srsState?.stability;
    if (s === null || s === undefined) return '—';
    if (s < 1)   return '<1d';
    if (s < 30)  return `${Math.round(s)}d`;
    if (s < 365) return `${Math.round(s / 30 * 10) / 10}mo`;
    return `${Math.round(s / 365 * 10) / 10}yr`;
  });

  readonly retrievabilityLabel = computed(() => {
    const r = this.card()?.srsState?.retrievability;
    if (r === null || r === undefined) return '—';
    return `${Math.round(r * 100)}%`;
  });

  readonly categoryName = computed(() => {
    const id = this.card()?.categoryIds?.[0];
    return id ? getCategoryName(id, this.categories()) : '';
  });

  readonly synonyms = computed(() => this.card()?.content.synonyms ?? []);

  // Accordion: only one synonym open at a time. null = all collapsed.
  private readonly expandedSynonym = signal<number | null>(null);

  toggleSynonym(i: number): void {
    this.expandedSynonym.set(this.expandedSynonym() === i ? null : i);
  }

  isSynonymExpanded(i: number): boolean {
    return this.expandedSynonym() === i;
  }

  playSynonymExample(sentence: string): void {
    void this.wordAudio.play(sentence, 'de-DE');
  }

  playPlural(): void {
    const plural = this.card()?.content.plural;
    if (plural) void this.wordAudio.play(plural, 'de-DE');
  }

  goBack(): void {
    this.navCtrl.back();
  }

  readonly isPronunciationLoading = this.wordAudio.isLoading;

  /** Cache key for this card's audio — mirrors the key used by WordAudioService. */
  private readonly _audioCacheKey = computed(() => {
    const card = this.card();
    if (!card) return '';
    const text = (card.content.article ? `${card.content.article} ` : '') + card.content.back;
    return `wa-de-DE-${normalizeForAudio(text, 'de-DE')}`;
  });

  /** 'ready' | 'pending' | 'failed' | 'unknown' — drives the readiness dot. */
  readonly audioStatus = computed(() =>
    this.audioReadiness.statusFor(this._audioCacheKey()),
  );

  readonly isAudioReady = computed(() => this.audioStatus() === 'ready');
  readonly isAudioPending = computed(() => this.audioStatus() === 'pending');

  playPronunciation(): void {
    const card = this.card();
    if (!card) return;
    void this.wordAudio.playCard(card);
  }

  playExample(sentence: string): void {
    void this.wordAudio.play(sentence, 'de-DE');
  }

  async openQuickRate(): Promise<void> {
    const card = this.card();
    if (!card) return;
    const modal = await this.modalCtrl.create({
      component: QuickRateSheetComponent,
      componentProps: { card },
      breakpoints: [0, 0.6, 0.75],
      initialBreakpoint: 0.75,
      handleBehavior: 'cycle',
    });
    await modal.present();
  }

  async openEdit(): Promise<void> {
    const card = this.card();
    const modal = await this.modalCtrl.create({
      component: AddWordSheetComponent,
      componentProps: { cardToEdit: card },
      breakpoints: [0, 0.95, 1],
      initialBreakpoint: 1,
    });
    await modal.present();
    const {data} = await modal.onWillDismiss();
    if (data?.created) this.cardStore.loadCards();
  }

  async confirmDelete(): Promise<void> {
    const wordBack = this.card()?.content.back ?? 'this word';
    const alert = await this.alertCtrl.create({
      header: this.translate.instant('wordDetail.deleteConfirm.title'),
      message: this.translate.instant('wordDetail.deleteConfirm.message', { word: wordBack }),
      buttons: [
        {text: this.translate.instant('common.cancel'), role: 'cancel'},
        {text: this.translate.instant('wordDetail.deleteConfirm.confirmButton'), role: 'destructive', handler: () => this.deleteCard()},
      ],
    });
    await alert.present();
  }

  highlightWord(sentence: string, word: string): string {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return sentence.replace(new RegExp(`(${escaped})`, 'gi'), '<strong>$1</strong>');
  }

  private deleteCard(): void {
    const id = this.cardId();
    if (!id) return;
    const card = this.card();
    const collectionId = card?.collectionId ?? null;

    // Optimistic: remove from CardStore immediately
    this.cardStore.setCardsFromSync(this.cardStore.cards().filter(c => c.id !== id));

    // Optimistic: decrement the collection's cardCount so the vault list updates instantly
    if (collectionId) {
      this.collectionStore.setCollectionsFromSync(
        this.collectionStore.collections().map(c =>
          c.id === collectionId
            ? { ...c, cardCount: Math.max(0, c.cardCount - 1) }
            : c
        )
      );
    }

    this.cardApi.remove(id).subscribe({
      error: () => {
        // Rollback: reload from cache on failure
        this.cardStore.loadCards();
        if (collectionId) this.collectionStore.loadCollections();
      },
    });

    if (collectionId) {
      this.router.navigate(['/vault/collections', collectionId]);
    } else {
      this.navCtrl.back();
    }
  }
}
