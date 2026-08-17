import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import type { ReviewRating, ScheduledCard } from '@lingua-card/shared/domain';
import { WordAudioService } from '../../../../shared/audio/word-audio.service';
import { CardStore } from '../../../vault/store/card.store';
import { CategoryStore } from '../../../vault/store/category.store';
import { ReviewStore } from '../../store/review.store';
import { TranslatePipe } from '@ngx-translate/core';
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
import { EngagementStore } from '../../../engagement/state/engagement.store';
import { DailyGoalFeedbackComponent } from '../../../engagement/components/daily-goal-feedback/daily-goal-feedback.component';

const SLOW_RATE = 0.7;
const MOMENTUM_CHECKPOINTS = [3, 5, 10] as const;

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
    DailyGoalFeedbackComponent,
  ],
})
export class ReviewPage {
  private readonly cardStore = inject(CardStore);
  protected readonly reviewStore = inject(ReviewStore);
  protected readonly engagementStore = inject(EngagementStore);
  private readonly wordAudio = inject(WordAudioService);
  private readonly categoryStore = inject(CategoryStore);
  private readonly router = inject(Router);
  private readonly answerEvaluator = inject(AnswerEvaluatorService);

  constructor() {
    addIcons({ closeOutline });

    // Reset per-card transient state whenever the user advances.
    effect(() => {
      this.reviewStore.presentation();
      this.expandedSynonym.set(null);
      this.typed.set('');
      this.typedResult.set(null);
      this.dontKnowSelected.set(false);
      this.previousCardId.set(null);
      this.isFlipped.set(false);
    });
  }

  readonly mode = computed(() => this.reviewStore.session()?.definition.mode ?? null);
  readonly isFlipped = signal(false);
  readonly typed = signal('');
  readonly typedResult = signal<TypedAnswerEvaluation | null>(null);
  readonly dontKnowSelected = signal(false);
  readonly previousCardId = signal<string | null>(null);
  readonly isMasteryConfirmationOpen = signal(false);
  readonly masteredCardLabel = signal<string | null>(null);
  readonly isViewingPrevious = computed(() => this.previousCardId() !== null);
  readonly isPronunciationLoading = this.wordAudio.isLoading;
  readonly expandedSynonym = signal<number | null>(null);
  readonly engagementReady = computed(() => this.engagementStore.loadState().status === 'ready');
  readonly dailyGoalProgress = computed(() => {
    const goal = this.engagementStore.dailyGoal();
    return goal > 0 ? Math.min(100, (this.engagementStore.completedToday() / goal) * 100) : 0;
  });
  readonly momentumCheckpoints = computed(() => {
    const total = this.reviewStore.totalOriginalCount();
    return MOMENTUM_CHECKPOINTS
      .filter(checkpoint => checkpoint < total)
      .map(checkpoint => ({
        count: checkpoint,
        position: (checkpoint / total) * 100,
        reached: this.reviewStore.resolvedOriginalCount() >= checkpoint,
      }));
  });

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

  readonly remaining = computed(() => {
    const session = this.reviewStore.session();
    if (!session) return 0;
    return session.definition.originalCardIds.filter(cardId =>
      !session.completedOriginalCardIds.includes(cardId)
      && !session.manuallyMasteredCardIds.includes(cardId)
      && !session.sessionSkippedCardIds.includes(cardId)
      && cardId !== session.currentCardId,
    ).length;
  });

  readonly suggestedRating = computed<ReviewRating | null>(
    () => this.dontKnowSelected() ? 'again' : this.typedResult()?.evaluation.suggestedRating ?? null,
  );

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

  readonly activeCategoryNames = computed(() => {
    const session = this.reviewStore.session();
    if (!session) return '';
    const cards = new Map(this.cardStore.cards().map(card => [card.id, card]));
    const cats = this.categoryStore.categories();
    const ids = [...new Set(session.definition.originalCardIds.flatMap(cardId => cards.get(cardId)?.categoryIds ?? []))];
    return ids
      .map(id => cats.find(c => c.id === id)?.name)
      .filter(Boolean)
      .slice(0, 3)
      .join(' · ') as string;
  });

  reveal(): void {
    this.isFlipped.set(true);
  }

  checkTyped(): void {
    const card = this.currentCard();
    if (!card || !this.typed().trim()) return;
    this.typedResult.set(this.answerEvaluator.evaluateTypedAnswer({
      answer: this.typed(),
      expectedWord: this.expectsGermanAnswer() ? card.content.back : card.content.front,
      expectedArticle: this.expectsGermanAnswer() ? card.content.article ?? null : null,
    }));
    this.isFlipped.set(true);
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
    const saved = await this.reviewStore.commitCurrentRating(finalRating, {
      reviewMode: isTyped ? 'typing' : 'recall',
      responseType: this.dontKnowSelected() ? 'dont_know' : isTyped ? 'typed_answer' : 'self_rated',
      answerEvaluation: isTyped ? typedResult.evaluation : undefined,
    });
    if (!saved) return;

    if (this.reviewStore.operation().kind === 'completed') {
      void this.router.navigate([ReviewRoute.SUMMARY], { replaceUrl: true });
    }
  }

  async dontKnow(): Promise<void> {
    this.dontKnowSelected.set(true);
    this.isFlipped.set(true);
  }

  async skipCard(): Promise<void> {
    if (this.isViewingPrevious()) return;
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

  showPrevious(): void {
    const cardId = this.reviewStore.lastReviewedCardId();
    if (!cardId) return;
    this.previousCardId.set(cardId);
    this.isFlipped.set(true);
  }

  returnToCurrent(): void {
    this.previousCardId.set(null);
    this.isFlipped.set(false);
  }

  playAudio(): void {
    const card = this.currentCard();
    if (!card) return;
    void this.wordAudio.playCard(card);
  }

  playSlow(): void {
    const card = this.currentCard();
    if (!card) return;
    void this.wordAudio.playTarget(card.content.back, 'de-DE', SLOW_RATE);
  }

  playExample(sentence: string): void {
    void this.wordAudio.play(sentence, 'de-DE');
  }

  exitSession(): void {
    this.reviewStore.leaveSession();
    void this.router.navigate([ReviewRoute.HUB]);
  }
}
