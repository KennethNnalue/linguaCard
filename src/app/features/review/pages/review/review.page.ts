import { Component, computed, inject, Injector, OnInit, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, take } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { NavController } from '@ionic/angular';
import { IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  checkmarkCircleOutline,
  chevronBackOutline,
  chevronDownOutline,
  chevronForwardOutline,
  flagOutline,
  volumeHighOutline,
} from 'ionicons/icons';
import { Card, ConfidenceRating } from '../../../../core/models/mock-data';
import { AudioService } from '../../../../core/services/audio.service';
import { CardStore } from '../../../../core/store/card.store';
import { CategoryStore } from '../../../../core/store/category.store';
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
  selector: 'app-review',
  templateUrl: './review.page.html',
  styleUrls: ['./review.page.scss', './review.card.scss', './review.rating.scss'],
  imports: [IonContent, IonIcon, IonToolbar, IonHeader],
})
export class ReviewPage implements OnInit {
  private readonly cardStore = inject(CardStore);
  private readonly reviewStore = inject(ReviewStore);
  private readonly audioService = inject(AudioService);
  private readonly categoryStore = inject(CategoryStore);
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
      checkmarkCircleOutline,
    });
  }

  readonly ratings = RATINGS;
  readonly queue = signal<Card[]>([]);
  readonly currentIndex = signal(0);
  readonly isFlipped = signal(false);
  readonly sessionComplete = signal(false);

  readonly currentCard = computed<Card>(() => this.queue()[this.currentIndex()]);

  readonly progressPercent = computed(() =>
    this.queue().length ? (this.currentIndex() / this.queue().length) * 100 : 0,
  );

  readonly sessionStats = computed(() => {
    const session = this.reviewStore.activeSession();
    const ratingsArray = Object.values(session?.ratings ?? {}) as ConfidenceRating[];
    return {
      reviewed: ratingsArray.length,
      newLearned: this.queue().filter(c => c.srsState?.state === 'new').length,
      mastered: ratingsArray.filter(r => r >= 4).length,
    };
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
    const genderMap: Record<string, string> = {
      der: 'masculine', die: 'feminine', das: 'neuter',
    };
    const gender = card.content.gender ?? genderMap[card.content.article] ?? '';
    return `${card.content.article} — ${gender}`;
  });

  ngOnInit(): void {
    const collectionId = this.route.snapshot.queryParamMap.get('collectionId');
    toObservable(this.cardStore.isLoading, { injector: this.injector })
      .pipe(filter(loading => !loading), take(1))
      .subscribe(() => {
        let dueCards = this.cardStore.dueCards();
        if (collectionId) {
          dueCards = dueCards.filter(c => c.collectionId === collectionId);
        }
        this.queue.set(dueCards);
        if (dueCards.length) {
          this.reviewStore.startSession(dueCards);
        }
      });
  }

  flipCard(): void {
    this.isFlipped.set(true);
  }

  submitRating(rating: ConfidenceRating): void {
    const card = this.currentCard();
    if (!card) return;
    this.reviewStore.rateCard(card, rating).subscribe({
      next: updated => {
        const idx = this.queue().findIndex(c => c.id === updated.id);
        if (idx >= 0) {
          const next = [...this.queue()];
          next[idx] = updated;
          this.queue.set(next);
        }
      },
    });
    this.advance();
  }

  skipCard(): void {
    this.advance();
  }

  playAudio(event: Event): void {
    event.stopPropagation();
    const card = this.currentCard();
    if (!card) return;
    const text = (card.content.article ? card.content.article + ' ' : '') + card.content.back;
    this.audioService.speak(text, 'de-DE').subscribe({ error: () => {} });
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

  private advance(): void {
    this.isFlipped.set(false);
    const next = this.currentIndex() + 1;
    if (next >= this.queue().length) {
      this.reviewStore.completeSession();
      this.sessionComplete.set(true);
    } else {
      this.currentIndex.set(next);
    }
  }
}
