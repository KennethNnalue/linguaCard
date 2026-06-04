import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, Injector, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { filter, take } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  chevronBackOutline,
  chevronDownOutline,
  chevronForwardOutline,
  flagOutline,
  volumeHighOutline,
} from 'ionicons/icons';
import type { Card, ConfidenceRating } from '@lingua-card/shared/domain';
import { ArticleBadgeComponent } from '../../../../shared/components/article-badge/article-badge.component';
import { WordAudioService } from '../../../../shared/audio/word-audio.service';
import { CardStore } from '../../../vault/store/card.store';
import { CategoryStore } from '../../../vault/store/category.store';
import { CollectionStore } from '../../../vault/store/collection.store';
import { ReviewStore } from '../../store/review.store';
import { HighlightWordPipe } from '../../shared/pipes/highlight-word.pipe';
import {
  ARTICLE_GENDER_MAP,
  RATING_OPTIONS,
  ReviewMode,
  ReviewQueryParam,
  ReviewRoute,
} from '../../models/review.model';

@Component({
  selector: 'lc-review',
  templateUrl: './review.page.html',
  styleUrls: ['./review.page.scss', './review.card.scss', './review.rating.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonIcon, IonToolbar, IonHeader, HighlightWordPipe, ArticleBadgeComponent],
})
export class ReviewPage implements OnInit {
  private readonly cardStore = inject(CardStore);
  private readonly reviewStore = inject(ReviewStore);
  private readonly wordAudio = inject(WordAudioService);
  private readonly categoryStore = inject(CategoryStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

  constructor() {
    addIcons({
      chevronBackOutline,
      chevronDownOutline,
      chevronForwardOutline,
      flagOutline,
      volumeHighOutline,
    });
  }

  readonly ratings = RATING_OPTIONS;
  readonly queue = signal<Card[]>([]);
  readonly currentIndex = signal(0);
  readonly isFlipped = signal(false);
  readonly isPronunciationLoading = this.wordAudio.isLoading;
  // Track the furthest index reached so going back and re-rating doesn't end the session early
  private highestIndexReached = 0;

  readonly currentCard = computed<Card>(() => this.queue()[this.currentIndex()]);

  readonly progressPercent = computed(() => {
    const q = this.queue();
    return q.length ? ((this.currentIndex() + 1) / q.length) * 100 : 0;
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

  readonly currentArticleLabel = computed(() => {
    const card = this.currentCard();
    if (!card?.content.article) return '';
    const gender = card.content.gender ?? ARTICLE_GENDER_MAP[card.content.article] ?? '';
    return `${card.content.article} — ${gender}`;
  });

  ngOnInit(): void {
    const pendingQueue = this.reviewStore.pendingQueue();
    if (pendingQueue.length > 0) {
      this.queue.set(pendingQueue);
      // Clear so ionViewWillEnter (fires after ngOnInit on first entry) doesn't
      // consume the same queue a second time and reset the session mid-play.
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
    // Ionic may reuse the component without calling ngOnInit when navigating
    // forward to a page already in the stack — re-init to pick up a new pending queue.
    const pendingQueue = this.reviewStore.pendingQueue();
    if (pendingQueue.length > 0) {
      this.queue.set(pendingQueue);
      this.currentIndex.set(0);
      this.isFlipped.set(false);
      this.highestIndexReached = 0;
      this.reviewStore.clearPendingQueue();
    }
  }

  flipCard(): void {
    this.isFlipped.set(true);
  }

  submitRating(rating: ConfidenceRating): void {
    const card = this.currentCard();
    if (!card) return;

    const idx = this.currentIndex();
    const queueLength = this.queue().length;

    // Update highest-index tracker
    if (idx > this.highestIndexReached) this.highestIndexReached = idx;
    // Session is only complete when we rate the final card for the first time
    const isLast = idx + 1 >= queueLength && this.highestIndexReached >= queueLength - 1;

    // Optimistic SRS update + local buffer + online flush — all handled inside rateCard().
    this.reviewStore.rateCard(card, rating);

    if (isLast) {
      this.reviewStore.completeSession(this.queue());
      void this.router.navigate([ReviewRoute.SUMMARY], { replaceUrl: true });
    }

    // Advance immediately for responsive UX
    this.isFlipped.set(false);
    if (!isLast) {
      this.currentIndex.set(idx + 1);
    }
  }

  goToPrevious(): void {
    const prev = this.currentIndex() - 1;
    if (prev < 0) return;
    this.currentIndex.set(prev);
    // Show the back face if this card was already rated — user can see their answer again
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

  playAudio(event: Event): void {
    event.stopPropagation();
    const card = this.currentCard();
    if (!card) return;
    void this.wordAudio.playCard(card);
  }

  playExample(event: Event, sentence: string): void {
    event.stopPropagation();
    void this.wordAudio.play(sentence, 'de-DE');
  }

  flagCard(): void {
    // TODO: implement flag via API
  }

  exitSession(): void {
    void this.router.navigate([ReviewRoute.HUB]);
  }
}
