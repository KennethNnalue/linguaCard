import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, IonContent, IonHeader, IonIcon, IonToolbar, ModalController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, volumeHighOutline, volumeMuteOutline } from 'ionicons/icons';
import type { ReviewRating, ScheduledCard } from '@lingua-card/shared/domain';
import { WordAudioService } from '../../../../shared/audio/word-audio.service';
import { CardStore } from '../../../vault/store/card.store';
import { ReviewStore } from '../../store/review.store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FrontFlipComponent } from './components/front-flip/front-flip.component';
import { FrontTypeComponent } from './components/front-type/front-type.component';
import { CardBackComponent } from './components/card-back/card-back.component';
import { RatingFooterComponent } from './components/rating-footer/rating-footer.component';
import { AnswerEvaluatorService, TypedAnswerEvaluation } from '../../services/answer-evaluator.service';
import {
  buildRatingOptionsWithPreviews,
  RATING_OPTIONS_NO_PREVIEW,
  RatingOption,
  ReviewRoute,
} from '../../models/review.model';
import { previewRatings } from '../../domain/review-domain';
import { schedulingStateFor } from '../../domain/review-persistence';
import { AddWordSheetComponent } from '../../../vault/components/add-word-sheet/add-word-sheet.component';
import { buildReviewPlayerHeader } from '../../application/build-review-player-header';
import { ReviewPrefsService } from '../../services/review-prefs.service';
import { shouldAutoplayFirstExample, shouldAutoplayReviewAnswer } from '../../application/review-audio-policy';
import {ReviewFeedbackService} from '../../services/review-feedback.service';
import {BottomSheetService} from '../../../../shared/components/bottom-sheet/bottom-sheet.service';

const SLOW_RATE = 0.7;

@Component({
  selector: 'lc-review',
  templateUrl: './review.page.html',
  styleUrls: ['./review.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonContent,
    IonIcon,
    IonToolbar,
    IonHeader,
    TranslatePipe,
    FrontFlipComponent,
    FrontTypeComponent,
    CardBackComponent,
    RatingFooterComponent,
  ],
})
export class ReviewPage {
  private readonly cardStore = inject(CardStore);
  protected readonly reviewStore = inject(ReviewStore);
  private readonly wordAudio = inject(WordAudioService);
  private readonly router = inject(Router);
  private readonly answerEvaluator = inject(AnswerEvaluatorService);
  private readonly modalController = inject(ModalController);
  private readonly alertController = inject(AlertController);
  private readonly translate = inject(TranslateService);
  private readonly reviewPrefs = inject(ReviewPrefsService);
  private readonly feedback = inject(ReviewFeedbackService);
  private readonly bottomSheet = inject(BottomSheetService);
  private audioSequence = 0;

  constructor() {
    addIcons({ closeOutline, volumeHighOutline, volumeMuteOutline });

    // Reset per-card transient state whenever the user advances.
    effect(() => {
      this.reviewStore.presentation();
      this.expandedSynonym.set(null);
      this.typed.set('');
      this.typedResult.set(null);
      this.dontKnowSelected.set(false);
      this.manualRating.set(null);
      this.previousCardId.set(null);
      this.isFlipped.set(false);
      this.isTypingFocused.set(false);
    });
  }

  readonly mode = computed(() => this.reviewStore.session()?.definition.mode ?? null);
  readonly isFlipped = signal(false);
  readonly typed = signal('');
  readonly typedResult = signal<TypedAnswerEvaluation | null>(null);
  readonly dontKnowSelected = signal(false);
  readonly manualRating = signal<ReviewRating | null>(null);
  readonly previousCardId = signal<string | null>(null);
  readonly isMasteryConfirmationOpen = signal(false);
  readonly masteredCardLabel = signal<string | null>(null);
  readonly isTypingFocused = signal(false);
  readonly isViewingPrevious = computed(() => this.previousCardId() !== null);
  readonly isPronunciationLoading = this.wordAudio.isLoading;
  readonly isAudioPlaying = this.wordAudio.isPlaying;
  readonly audioPlaybackError = this.wordAudio.playbackError;
  readonly expandedSynonym = signal<number | null>(null);
  readonly sessionMuted = signal(false);
  private readonly currentViewSnapshot = signal<{
    flipped: boolean;
    typed: string;
    typedResult: TypedAnswerEvaluation | null;
    dontKnow: boolean;
  } | null>(null);
  private readonly lastCommittedView = signal<{
    cardId: string;
    typedResult: TypedAnswerEvaluation | null;
    dontKnow: boolean;
    rating: ReviewRating;
  } | null>(null);
  readonly historicalRating = computed(() => this.isViewingPrevious() ? this.lastCommittedView()?.rating ?? null : null);

  readonly currentCard = computed<ScheduledCard | null>(() => {
    const cardId = this.previousCardId() ?? this.reviewStore.presentation()?.cardId;
    const card = cardId ? this.cardStore.cards().find(candidate => candidate.id === cardId) : undefined;
    if (!card) return null;
    return {
      ...card,
      content: {
        ...card.content,
        synonyms: card.content.synonyms ?? [],
        examples: card.content.examples ?? [],
      },
    };
  });

  readonly ratingOptionsWithPreviews = computed<RatingOption[]>(() => {
    const card = this.currentCard();
    if (!card || !this.isFlipped()) return RATING_OPTIONS_NO_PREVIEW;
    const previews = previewRatings(schedulingStateFor(card), new Date());
    const options = buildRatingOptionsWithPreviews({
      again: previews.again.nextIntervalMinutes ?? 0,
      hard: previews.hard.nextIntervalMinutes ?? 0,
      good: previews.good.nextIntervalMinutes ?? 0,
      easy: previews.easy.nextIntervalMinutes ?? 0,
    });
    return this.dontKnowSelected()
      ? options.filter(option => option.value === 'again')
      : options;
  });

  readonly progressPercent = computed(() => {
    const total = this.reviewStore.totalOriginalCount();
    if (!total) return 0;
    const completed = this.reviewStore.resolvedOriginalCount();
    return ((completed + (this.isFlipped() ? 0.5 : 0)) / total) * 100;
  });

  readonly currentPosition = computed(() => Math.min(
    this.reviewStore.resolvedOriginalCount() + 1,
    this.reviewStore.totalOriginalCount(),
  ));

  readonly displayedPosition = computed(() => Math.max(
    1,
    this.currentPosition() - (this.isViewingPrevious() ? 1 : 0),
  ));

  readonly playerHeader = computed(() => buildReviewPlayerHeader({
    currentPosition: this.currentPosition(),
    totalCards: this.reviewStore.totalOriginalCount(),
  }));


  readonly suggestedRating = computed<ReviewRating | null>(
    () => this.dontKnowSelected() ? 'again' : this.typedResult()?.evaluation.suggestedRating ?? null,
  );

  readonly displayedRating = computed<ReviewRating | null>(() => {
    if (this.isViewingPrevious()) return this.historicalRating() ?? 'good';
    if (!this.isFlipped()) return null;
    return this.manualRating() ?? this.suggestedRating() ?? 'good';
  });

  private readonly showGermanPrompt = computed(() => {
    return this.reviewStore.presentation()?.direction === 'target_to_source';
  });

  readonly expectsGermanAnswer = computed(() => !this.showGermanPrompt());

  readonly flipPrompt = computed(() => {
    const card = this.currentCard();
    if (!card) return '';
    return this.showGermanPrompt() ? card.content.back : card.content.front;
  });

  readonly flipCue = computed(() =>
    this.showGermanPrompt() ? 'review.session.whatDoesThisMean' : 'review.session.whatIsGermanFor',
  );

  readonly flipHint = computed(() => {
    const tags = this.currentCard()?.tags ?? [];
    return tags.length ? tags[0] : null;
  });


  reveal(): void {
    this.isFlipped.set(true);
    this.feedback.reveal();
    void this.runRevealAutoplay();
  }

  checkTyped(): void {
    const card = this.currentCard();
    if (!card || !this.typed().trim()) return;
    this.isTypingFocused.set(false);
    this.typedResult.set(this.answerEvaluator.evaluateTypedAnswer({
      answer: this.typed(),
      expectedWord: this.expectsGermanAnswer() ? card.content.back : card.content.front,
      expectedArticle: this.expectsGermanAnswer() ? card.content.article ?? null : null,
    }));
    this.isFlipped.set(true);
    if (this.typedResult()?.evaluation.result === 'correct') this.feedback.correct();
    else this.feedback.needsAttention();
    void this.runRevealAutoplay();
  }

  toggleSynonym(i: number): void {
    this.expandedSynonym.set(this.expandedSynonym() === i ? null : i);
  }

  async submitRating(rating: ReviewRating): Promise<void> {
    if (this.isViewingPrevious()) return;
    const card = this.currentCard();
    if (!card) return;

    const typedResult = this.typedResult();
    const isTyped = this.mode() === 'typing' && typedResult !== null;
    const finalRating = this.dontKnowSelected() ? 'again' : rating;
    this.cancelAudio();
    const saved = await this.reviewStore.commitCurrentRating(finalRating, {
      reviewMode: isTyped ? 'typing' : 'recall',
      responseType: this.dontKnowSelected() ? 'dont_know' : isTyped ? 'typed_answer' : 'self_rated',
      answerEvaluation: isTyped ? typedResult.evaluation : undefined,
    });
    if (!saved) return;
    this.lastCommittedView.set({cardId: card.id, typedResult, dontKnow: this.dontKnowSelected(), rating: finalRating});
    this.feedback.ratingCommitted();

    if (this.reviewStore.operation().kind === 'completed') {
      void this.router.navigate([ReviewRoute.SUMMARY], { replaceUrl: true });
    }
  }

  async dontKnow(): Promise<void> {
    this.isTypingFocused.set(false);
    this.dontKnowSelected.set(true);
    this.isFlipped.set(true);
    this.feedback.needsAttention();
    void this.runRevealAutoplay();
  }

  async skipCard(): Promise<void> {
    if (this.isViewingPrevious()) return;
    this.cancelAudio();
    if (!await this.reviewStore.skipCurrentCard()) return;
    if (this.reviewStore.operation().kind === 'completed') {
      void this.router.navigate([ReviewRoute.SUMMARY], { replaceUrl: true });
    }
  }

  requestManualMastery(): void {
    if (this.isViewingPrevious() || this.reviewStore.isBusy()) return;
    this.isMasteryConfirmationOpen.set(true);
  }

  cancelManualMastery(): void {
    if (this.reviewStore.isBusy()) return;
    this.isMasteryConfirmationOpen.set(false);
  }

  async confirmManualMastery(): Promise<void> {
    const card = this.currentCard();
    if (!card || this.reviewStore.isBusy()) return;
    const cardLabel = card.content.back;
    const mastered = await this.reviewStore.masterCurrentCard();
    if (!mastered) return;
    this.isMasteryConfirmationOpen.set(false);
    this.masteredCardLabel.set(cardLabel);
    await new Promise(resolve => setTimeout(resolve, 650));
    this.masteredCardLabel.set(null);
    if (this.reviewStore.operation().kind === 'completed') {
      void this.router.navigate([ReviewRoute.SUMMARY], { replaceUrl: true });
    }
  }

  async openCardEditor(): Promise<void> {
    if (this.reviewStore.isBusy()) return;
    const card = this.currentCard();
    if (!card) return;
    const modal = await this.modalController.create({
      component: AddWordSheetComponent,
      componentProps: { cardToEdit: card },
      breakpoints: [0, 0.95, 1],
      initialBreakpoint: 1,
    });
    await modal.present();
  }

  async openCardActions(): Promise<void> {
    if (this.isViewingPrevious() || this.reviewStore.isBusy()) return;
    await this.bottomSheet.open(this.translate.instant('review.session.cardActions'), [
      {
        label: this.translate.instant('review.session.editCard'),
        description: this.translate.instant('review.session.editCardHint'),
        icon: 'create-outline',
        handler: () => void this.openCardEditor(),
      },
      {
        label: this.translate.instant('review.session.masterCard'),
        description: this.translate.instant('review.session.masterCardHint'),
        icon: 'star-outline',
        handler: () => this.requestManualMastery(),
      },
      {
        label: this.translate.instant('review.session.changeRating'),
        description: this.translate.instant('review.session.changeRatingHint'),
        icon: 'options-outline',
        handler: () => void this.openRatingActions(),
      },
      {label: this.translate.instant('common.cancel'), role: 'cancel'},
    ]);
  }

  async openRatingActions(): Promise<void> {
    await this.bottomSheet.open(this.translate.instant('review.session.changeRating'), [
      ...this.ratingOptionsWithPreviews().map(option => ({
        label: this.translate.instant(`review.rating.${option.value}`),
        description: option.previewLabel ?? undefined,
        handler: () => this.manualRating.set(option.value),
      })),
      {label: this.translate.instant('common.cancel'), role: 'cancel' as const},
    ]);
  }

  submitDisplayedRating(): void {
    const rating = this.displayedRating();
    if (rating) void this.submitRating(rating);
  }

  showPrevious(): void {
    const cardId = this.reviewStore.lastReviewedCardId();
    if (!cardId) return;
    this.cancelAudio();
    this.currentViewSnapshot.set({
      flipped: this.isFlipped(), typed: this.typed(), typedResult: this.typedResult(), dontKnow: this.dontKnowSelected(),
    });
    this.previousCardId.set(cardId);
    const committed = this.lastCommittedView();
    this.typedResult.set(committed?.cardId === cardId ? committed.typedResult : null);
    this.dontKnowSelected.set(committed?.cardId === cardId ? committed.dontKnow : false);
    this.isFlipped.set(true);
    void this.runRevealAutoplay(true);
  }

  returnToCurrent(): void {
    this.cancelAudio();
    const snapshot = this.currentViewSnapshot();
    this.previousCardId.set(null);
    this.isFlipped.set(snapshot?.flipped ?? false);
    this.typed.set(snapshot?.typed ?? '');
    this.typedResult.set(snapshot?.typedResult ?? null);
    this.dontKnowSelected.set(snapshot?.dontKnow ?? false);
    this.currentViewSnapshot.set(null);
  }

  playAudio(): void {
    if (this.sessionMuted()) return;
    const card = this.currentCard();
    if (!card) return;
    void this.wordAudio.playCard(card);
  }

  playSlow(): void {
    if (this.sessionMuted()) return;
    const card = this.currentCard();
    if (!card) return;
    void this.wordAudio.playTarget(card.content.back, 'de-DE', SLOW_RATE);
  }

  playExample(sentence: string): void {
    if (this.sessionMuted()) return;
    void this.wordAudio.play(sentence, 'de-DE');
  }

  toggleSessionMute(): void {
    this.sessionMuted.update(muted => !muted);
    this.cancelAudio();
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (document.visibilityState !== 'visible') this.cancelAudio();
  }

  private cancelAudio(): void {
    this.audioSequence++;
    this.wordAudio.stop();
  }

  private async runRevealAutoplay(includeHistorical = false): Promise<void> {
    const card = this.currentCard();
    if (!card || (this.isViewingPrevious() && !includeHistorical)) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const policy = {
      mode: this.reviewPrefs.autoplay(),
      muted: this.sessionMuted(),
      documentVisible: document.visibilityState === 'visible',
      saveData: connection?.saveData === true,
    } as const;
    if (!shouldAutoplayReviewAnswer(policy)) return;
    const sequence = ++this.audioSequence;
    const answer = `${card.content.article ? `${card.content.article} ` : ''}${card.content.back}`;
    await new Promise(resolve => setTimeout(resolve, 300));
    if (sequence !== this.audioSequence) return;
    await this.wordAudio.playTarget(answer, 'de-DE');
    if (!shouldAutoplayFirstExample(policy) || sequence !== this.audioSequence || !card.content.examples[0]) return;
    await new Promise(resolve => setTimeout(resolve, 500));
    if (sequence !== this.audioSequence) return;
    await this.wordAudio.playTarget(card.content.examples[0].target, 'de-DE');
  }

  async requestExit(): Promise<void> {
    if (this.reviewStore.resolvedOriginalCount() === 0) {
      this.exitSession();
      return;
    }

    const alert = await this.alertController.create({
      header: this.translate.instant('review.session.leaveTitle'),
      message: this.translate.instant('review.session.leaveBody'),
      buttons: [
        {text: this.translate.instant('review.session.keepReviewing'), role: 'cancel'},
        {
          text: this.translate.instant('review.session.leaveAction'),
          role: 'destructive',
          handler: () => this.exitSession(),
        },
      ],
    });
    await alert.present();
  }

  private exitSession(): void {
    this.cancelAudio();
    this.reviewStore.leaveSession();
    void this.router.navigate([ReviewRoute.HUB]);
  }
}
