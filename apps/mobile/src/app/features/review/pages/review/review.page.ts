import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, Injector, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { filter, take } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import type { Card, ConfidenceRating } from '@lingua-card/shared/domain';
import { WordAudioService } from '../../../../shared/audio/word-audio.service';
import { FsrsService } from '../../../../shared/srs/fsrs.service';
import { CardStore } from '../../../vault/store/card.store';
import { CategoryStore } from '../../../vault/store/category.store';
import { CollectionStore } from '../../../vault/store/collection.store';
import { ReviewStore } from '../../store/review.store';
import { ReviewPrefsService } from '../../services/review-prefs.service';
import { TranslatePipe } from '@ngx-translate/core';
import { FrontFlipComponent } from './components/front-flip/front-flip.component';
import { FrontTypeComponent } from './components/front-type/front-type.component';
import { FrontListenComponent } from './components/front-listen/front-listen.component';
import { CardBackComponent } from './components/card-back/card-back.component';
import { RatingFooterComponent } from './components/rating-footer/rating-footer.component';
import { gradeTypedAnswer, TypedAnswerResult } from './grading/typed-answer.grader';
import {
  buildRatingOptionsWithPreviews,
  RATING_OPTIONS_NO_PREVIEW,
  RatingOption,
  ReviewMode,
  ReviewQueryParam,
  ReviewRoute,
} from '../../models/review.model';

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
    FrontListenComponent,
    CardBackComponent,
    RatingFooterComponent,
  ],
})
export class ReviewPage implements OnInit {
  private readonly cardStore = inject(CardStore);
  private readonly reviewStore = inject(ReviewStore);
  private readonly wordAudio = inject(WordAudioService);
  private readonly fsrs = inject(FsrsService);
  private readonly prefs = inject(ReviewPrefsService);
  private readonly categoryStore = inject(CategoryStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

  constructor() {
    addIcons({ closeOutline });

    // Reset per-card transient state whenever the user advances.
    effect(() => {
      this.currentIndex();
      this.expandedSynonym.set(null);
      this.typed.set('');
      this.typedResult.set(null);
    });
  }

  readonly mode = this.prefs.mode;
  readonly queue = signal<Card[]>([]);
  readonly currentIndex = signal(0);
  readonly isFlipped = signal(false);
  readonly typed = signal('');
  readonly typedResult = signal<TypedAnswerResult | null>(null);
  readonly isPronunciationLoading = this.wordAudio.isLoading;
  private highestIndexReached = 0;
  readonly expandedSynonym = signal<number | null>(null);

  readonly currentCard = computed<Card | null>(() => {
    const card = this.queue()[this.currentIndex()];
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
    if (!card?.srsState || !this.isFlipped()) return RATING_OPTIONS_NO_PREVIEW;
    return buildRatingOptionsWithPreviews(this.fsrs.previewIntervals(card.srsState));
  });

  // Progress: half-step credit once the card is flipped (per design spec).
  readonly progressPercent = computed(() => {
    const total = this.queue().length;
    if (!total) return 0;
    return ((this.currentIndex() + (this.isFlipped() ? 0.5 : 0)) / total) * 100;
  });

  readonly remaining = computed(() => Math.max(0, this.queue().length - this.currentIndex() - 1));

  readonly suggestedRating = computed<ConfidenceRating | null>(
    () => this.typedResult()?.suggested ?? null,
  );

  // Prompt direction (custom study). Affects the Flip front face only — Type
  // always asks for German (the grader is German-specific) and Listen plays the
  // German audio. For "mixed", alternate stably by card index.
  private readonly showGermanPrompt = computed(() => {
    const dir = this.prefs.dir();
    if (dir === 'de-en') return true;
    if (dir === 'mixed') return this.currentIndex() % 2 === 0;
    return false;
  });

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
    const queue = this.queue();
    if (!queue.length) return '';
    const cats = this.categoryStore.categories();
    const ids = [...new Set(queue.flatMap(c => c.categoryIds))];
    return ids
      .map(id => cats.find(c => c.id === id)?.name)
      .filter(Boolean)
      .slice(0, 3)
      .join(' · ') as string;
  });

  ngOnInit(): void {
    const pendingQueue = this.reviewStore.pendingQueue();
    if (pendingQueue.length > 0) {
      this.queue.set(pendingQueue);
      this.reviewStore.clearPendingQueue();
      return;
    }

    const collectionId = this.route.snapshot.queryParamMap.get(ReviewQueryParam.COLLECTION_ID);
    const mode = this.route.snapshot.queryParamMap.get(ReviewQueryParam.MODE);
    const cardIdsParam = this.route.snapshot.queryParamMap.get(ReviewQueryParam.CARD_IDS);

    toObservable(this.cardStore.isLoading, { injector: this.injector })
      .pipe(filter(loading => !loading), take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        let cards: Card[];

        if (mode === ReviewMode.RETRY && cardIdsParam) {
          const ids = new Set(cardIdsParam.split(','));
          cards = this.cardStore.cards().filter(c => ids.has(c.id));
        } else if (mode === ReviewMode.ALL) {
          cards = this.cardStore.cards();
          if (collectionId) cards = cards.filter(c => c.collectionId === collectionId);
        } else {
          cards = this.cardStore.dueCards();
          if (collectionId) cards = cards.filter(c => c.collectionId === collectionId);
        }

        this.queue.set(cards);
        if (cards.length > 0) {
          const col = collectionId
            ? this.collectionStore.collections().find(c => c.id === collectionId) ?? null
            : null;
          const collectionName = col ? `${col.emoji ?? ''} ${col.name}`.trim() : null;
          this.reviewStore.startSession(cards, collectionId, collectionName);
        }
      });
  }

  ionViewWillEnter(): void {
    const pendingQueue = this.reviewStore.pendingQueue();
    if (pendingQueue.length > 0) {
      this.queue.set(pendingQueue);
      this.currentIndex.set(0);
      this.isFlipped.set(false);
      this.highestIndexReached = 0;
      this.reviewStore.clearPendingQueue();
    }
  }

  reveal(): void {
    this.isFlipped.set(true);
  }

  checkTyped(): void {
    const card = this.currentCard();
    if (!card || !this.typed().trim()) return;
    this.typedResult.set(
      gradeTypedAnswer(this.typed(), card.content.back, card.content.article ?? null),
    );
    this.isFlipped.set(true);
  }

  toggleSynonym(i: number): void {
    this.expandedSynonym.set(this.expandedSynonym() === i ? null : i);
  }

  submitRating(rating: ConfidenceRating): void {
    const card = this.currentCard();
    if (!card) return;

    const idx = this.currentIndex();
    const queueLength = this.queue().length;
    if (idx > this.highestIndexReached) this.highestIndexReached = idx;
    const isLast = idx + 1 >= queueLength && this.highestIndexReached >= queueLength - 1;

    this.reviewStore.rateCard(card, rating);

    if (isLast) {
      const liveMap = new Map(this.cardStore.cards().map(c => [c.id, c]));
      const freshQueue = this.queue().map(c => liveMap.get(c.id) ?? c);
      this.reviewStore.completeSession(freshQueue);
      void this.router.navigate([ReviewRoute.SUMMARY], { replaceUrl: true });
    }

    this.isFlipped.set(false);
    if (!isLast) {
      this.currentIndex.set(idx + 1);
    }
  }

  goToPrevious(): void {
    const prev = this.currentIndex() - 1;
    if (prev < 0) return;
    this.currentIndex.set(prev);
    const card = this.queue()[prev];
    const alreadyRated = this.reviewStore.activeSession()?.ratings[card?.id] !== undefined;
    this.isFlipped.set(alreadyRated);
  }

  skipCard(): void {
    this.isFlipped.set(false);
    const next = this.currentIndex() + 1;
    if (next < this.queue().length) {
      this.currentIndex.set(next);
    }
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
    void this.router.navigate([ReviewRoute.HUB]);
  }
}
