import {ChangeDetectionStrategy, Component, computed, inject, signal} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {toSignal} from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import {AlertController, IonContent, IonIcon, ModalController, NavController,} from '@ionic/angular/standalone';
import {TranslatePipe, TranslateService} from '@ngx-translate/core';
import {addIcons} from 'ionicons';
import {
  chevronDownOutline,
  createOutline,
  trashOutline,
  volumeHighOutline,
} from 'ionicons/icons';
import {LanguageService} from '../../../../core/services/language.service';
import {CardStore} from '../../store/card.store';
import {CollectionStore} from '../../store/collection.store';
import {CardApiService} from '../../services/card-api.service';
import {WordAudioService} from '../../../../shared/audio/word-audio.service';
import {AudioReadinessStore} from '../../../../shared/audio/audio-readiness.store';
import {ArticleBadgeComponent} from '../../../../shared/components/article-badge/article-badge.component';
import {AddWordSheetComponent} from '../../components/add-word-sheet/add-word-sheet.component';
import {normalizeForAudio} from '../../../../shared/audio/normalize';
import {stageIndicator} from '../../../review/domain/review-status';
import {MASTERY_LABEL_KEYS} from '../../../review/models/review.model';
import {CardAdministrationService} from '../../../review/services/card-administration.service';
import {VaultV2Store} from '../../store/vault-v2.store';

@Component({
  selector: 'lc-word-detail',
  templateUrl: './word-detail.component.html',
  styleUrls: ['./word-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonIcon, ArticleBadgeComponent, TranslatePipe],
})
export class WordDetailComponent {
  private readonly cardStore = inject(CardStore);
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
  private readonly cardAdministration = inject(CardAdministrationService);
  private readonly vaultStore = inject(VaultV2Store);
  readonly administrationState = signal<'idle' | 'saving' | 'error'>('idle');

  constructor() {
    addIcons({
      chevronDownOutline,
      volumeHighOutline,
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


  readonly masteryLevel = computed(() => stageIndicator(this.card()?.reviewState.stage ?? 'new'));
  readonly isManuallyMastered = computed(() => this.card()?.reviewState.masterySource === 'manual');


  // Used only for the SVG ring stroke — mastery colors are the same in both modes
  readonly masteryColor = computed(() =>
    ['var(--lc-mastery-0)', 'var(--lc-mastery-1)', 'var(--lc-mastery-2)',
     'var(--lc-mastery-3)', 'var(--lc-mastery-4)', 'var(--lc-mastery-5)'][this.masteryLevel()]
  );

  readonly masteryLabel = computed(() => {
    this.languageService.current(); // recompute on UI language change
    return this.translate.instant(MASTERY_LABEL_KEYS[this.card()?.reviewState.stage ?? 'new']);
  });

  readonly masteryRingOffset = computed(() => {
    // Circumference for r=22: 2π*22 ≈ 138.23
    const circumference = 2 * Math.PI * 22;
    const progress = this.masteryLevel() / 5;
    return circumference * (1 - progress);
  });

  readonly nextReviewText = computed(() => {
    this.languageService.current(); // recompute on UI language change
    const nextDue = this.card()?.reviewState.dueAt;
    if (!nextDue) return '—';
    const days = Math.ceil((new Date(nextDue).getTime() - Date.now()) / 86_400_000);
    if (days <= 0) return this.translate.instant('wordDetail.nextReview.dueNow');
    if (days === 1) return this.translate.instant('wordDetail.nextReview.tomorrow');
    return this.translate.instant('wordDetail.nextReview.inDays', { days });
  });

  readonly lastReviewedText = computed(() => {
    this.languageService.current(); // recompute on UI language change
    const last = this.card()?.updatedAt;
    if (!last) return this.translate.instant('wordDetail.lastReviewed.never');
    const days = Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000);
    if (days === 0) return this.translate.instant('wordDetail.lastReviewed.today');
    return this.translate.instant('wordDetail.lastReviewed.daysAgo', { days });
  });

  readonly stabilityLabel = computed(() => {
    const minutes = this.card()?.reviewState.intervalMinutes;
    if (minutes === null || minutes === undefined) return '—';
    return `${Math.round(minutes / 1_440)}d`;
  });

  readonly retrievabilityLabel = computed(() => {
    const state = this.card()?.reviewState;
    if (!state || state.totalReviewCount === 0) return '—';
    const successful = state.totalReviewCount - state.totalAgainCount;
    return `${Math.round((successful / state.totalReviewCount) * 100)}%`;
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
    void this.wordAudio.play(sentence, this.targetLocale());
  }

  playPlural(): void {
    const plural = this.card()?.content.plural;
    if (plural) void this.wordAudio.play(plural, this.targetLocale());
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
    const locale = this.targetLocale();
    return `wa-${locale}-${normalizeForAudio(text, locale)}`;
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
    void this.wordAudio.playCard(card, this.targetLocale());
  }

  playExample(sentence: string): void {
    void this.wordAudio.play(sentence, this.targetLocale());
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

  private targetLocale(): string {
    const language = this.vaultStore.vault()?.learningContext.targetLanguage ?? 'de';
    const locales: Record<string, string> = { de: 'de-DE', en: 'en-US', es: 'es-ES', ar: 'ar-SA' };
    return locales[language] ?? language;
  }

  async confirmUndoManualMastery(): Promise<void> {
    const card = this.card();
    if (!card || !this.isManuallyMastered() || this.administrationState() === 'saving') return;
    const alert = await this.alertCtrl.create({
      header: this.translate.instant('wordDetail.manualMastery.undoTitle'),
      message: this.translate.instant('wordDetail.manualMastery.undoMessage', { word: card.content.back }),
      buttons: [
        { text: this.translate.instant('common.cancel'), role: 'cancel' },
        {
          text: this.translate.instant('wordDetail.manualMastery.undoButton'),
          handler: () => { void this.undoManualMastery(); },
        },
      ],
    });
    await alert.present();
  }

  private async undoManualMastery(): Promise<void> {
    const card = this.card();
    if (!card) return;
    this.administrationState.set('saving');
    try {
      await this.cardAdministration.undoManualMastery(card);
      this.administrationState.set('idle');
    } catch {
      this.administrationState.set('error');
    }
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
