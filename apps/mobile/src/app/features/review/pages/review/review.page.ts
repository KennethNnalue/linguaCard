import { Component, computed, inject, Injector, OnInit, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, take } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { NavController } from '@ionic/angular';
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
import { PronunciationService } from '../../../ai/audio/pronunciation.service';
import { CardStore } from '../../../vault/store/card.store';
import { CategoryStore } from '../../../vault/store/category.store';
import { CollectionStore } from '../../../vault/store/collection.store';
import { ReviewStore } from '../../store/review.store';

const RATINGS: { value: ConfidenceRating; label: string }[] = [
  { value: 0, label: 'Blank' },
  { value: 1, label: 'Hard' },
  { value: 2, label: 'Hmm' },
  { value: 3, label: 'Good' },
  { value: 4, label: 'Easy' },
  { value: 5, label: 'Nailed' },
];

@Component({
  selector: 'lc-review',
  templateUrl: './review.page.html',
  styleUrls: ['./review.page.scss', './review.card.scss', './review.rating.scss'],
  imports: [IonContent, IonIcon, IonToolbar, IonHeader],
})
export class ReviewPage implements OnInit {
  private readonly cardStore = inject(CardStore);
  private readonly reviewStore = inject(ReviewStore);
  private readonly pronunciationService = inject(PronunciationService);
  private readonly categoryStore = inject(CategoryStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly navCtrl = inject(NavController);
  private readonly injector = inject(Injector);
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

  readonly ratings = RATINGS;
  readonly queue = signal<Card[]>([]);
  readonly currentIndex = signal(0);
  readonly isFlipped = signal(false);
  readonly isPronunciationLoading = this.pronunciationService.isLoading;

  readonly currentCard = computed<Card>(() => this.queue()[this.currentIndex()]);

  readonly progressPercent = computed(() =>
    this.queue().length ? ((this.currentIndex() + 1) / this.queue().length) * 100 : 0,
  );

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
    const genderMap: Record<string, string> = {
      der: 'masculine', die: 'feminine', das: 'neuter',
    };
    const gender = card.content.gender ?? genderMap[card.content.article] ?? '';
    return `${card.content.article} — ${gender}`;
  });

  ngOnInit(): void {
    // If a session was pre-started (from Review Hub, Custom Study, etc.), use pending queue.
    const pendingQueue = this.reviewStore.pendingQueue();
    if (pendingQueue.length > 0) {
      this.queue.set(pendingQueue);
      return;
    }

    const collectionId = this.route.snapshot.queryParamMap.get('collectionId');
    const mode = this.route.snapshot.queryParamMap.get('mode');
    const cardIdsParam = this.route.snapshot.queryParamMap.get('cardIds');

    toObservable(this.cardStore.isLoading, { injector: this.injector })
      .pipe(filter(loading => !loading), take(1))
      .subscribe(() => {
        let cards: Card[];

        if (mode === 'retry' && cardIdsParam) {
          const ids = new Set(cardIdsParam.split(','));
          cards = this.cardStore.cards().filter(c => ids.has(c.id));
        } else if (mode === 'all') {
          cards = this.cardStore.cards();
          if (collectionId) cards = cards.filter(c => c.collectionId === collectionId);
        } else {
          cards = this.cardStore.dueCards();
          if (collectionId) cards = cards.filter(c => c.collectionId === collectionId);
        }

        this.queue.set(cards);
        if (cards.length) {
          const col = collectionId
            ? this.collectionStore.collections().find(c => c.id === collectionId) ?? null
            : null;
          const collectionName = col ? `${col.emoji ?? ''} ${col.name}`.trim() : null;
          this.reviewStore.startSession(cards, collectionId, collectionName);
        }
      });
  }

  flipCard(): void {
    this.isFlipped.set(true);
  }

  submitRating(rating: ConfidenceRating): void {
    const card = this.currentCard();
    if (!card) return;

    const isLast = this.currentIndex() + 1 >= this.queue().length;

    this.reviewStore.rateCard(card, rating).subscribe({
      next: updated => {
        // Fix Bug 2: update CardStore so word-detail shows fresh lastReviewedAt
        this.cardStore.updateCard(updated);

        const idx = this.queue().findIndex(c => c.id === updated.id);
        if (idx >= 0) {
          const next = [...this.queue()];
          next[idx] = updated;
          this.queue.set(next);
        }

        // Fix Bug 4: complete session only after HTTP response (queue has updated srsState)
        if (isLast) {
          this.reviewStore.completeSession(this.queue());
          this.navCtrl.navigateForward('/review/summary', { animated: true });
        }
      },
    });

    // Advance index immediately for responsive UX (don't wait for network)
    this.isFlipped.set(false);
    if (!isLast) {
      this.currentIndex.set(this.currentIndex() + 1);
    }
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
    void this.pronunciationService.play(card);
  }

  flagCard(): void {
    // TODO: implement flag via API
  }

  exitSession(): void {
    this.navCtrl.back();
  }

  highlightWord(sentence: string, word: string): string {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return sentence.replace(new RegExp(`(${escaped})`, 'gi'), '<strong>$1</strong>');
  }
}
