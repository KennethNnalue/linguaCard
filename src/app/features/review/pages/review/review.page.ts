import { Component, computed, inject, Injector, OnInit, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, take } from 'rxjs';
import { NavController } from '@ionic/angular';
import { IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import { Card, ConfidenceRating } from '../../../../core/models/mock-data';
import { MockAudioService, MockReviewService } from '../../../../core/services/mock-services';
import { CardStore } from '../../../../core/store/card.store';
import { ArticleBadgeComponent } from '../../../../shared/components/article-badge/article-badge.component';

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
  styleUrls: ['./review.page.scss'],
  imports: [IonContent, IonIcon, IonToolbar, IonHeader, ArticleBadgeComponent],
})
export class ReviewPage implements OnInit {
  private readonly cardStore = inject(CardStore);
  private readonly reviewService = inject(MockReviewService);
  private readonly audioService = inject(MockAudioService);
  private readonly navCtrl = inject(NavController);
  private readonly injector = inject(Injector);

  readonly ratings = RATINGS;
  readonly queue = signal<Card[]>([]);
  readonly currentIndex = signal(0);
  readonly isFlipped = signal(false);
  readonly sessionComplete = signal(false);
  readonly sessionId = signal<string | null>(null);

  // Non-null by design: the template only accesses currentCard() when the queue is non-empty
  readonly currentCard = computed<Card>(
    () => this.queue()[this.currentIndex()],
  );
  readonly progressPercent = computed(() =>
    this.queue().length
      ? (this.currentIndex() / this.queue().length) * 100
      : 0,
  );
  readonly sessionStats = computed(() => {
    const session = this.reviewService.activeSession();
    const ratingsMap = session?.ratings ?? {};
    const ratingsArray = Object.values(ratingsMap) as ConfidenceRating[];
    return {
      reviewed: ratingsArray.length,
      newLearned: this.queue().filter(c => c.srsState?.state === 'new').length,
      mastered: ratingsArray.filter(r => r >= 4).length,
    };
  });

  ngOnInit(): void {
    // Wait for the store to finish loading, then seed the review queue
    toObservable(this.cardStore.isLoading, { injector: this.injector })
      .pipe(
        filter(loading => !loading),
        take(1),
      )
      .subscribe(() => {
        const dueCards = this.cardStore.dueCards();
        this.queue.set(dueCards);
        if (dueCards.length) {
          this.reviewService
            .startSession(dueCards)
            .subscribe(s => this.sessionId.set(s.id));
        }
      });
  }

  flipCard(): void {
    this.isFlipped.set(true);
  }

  submitRating(rating: ConfidenceRating): void {
    const card = this.currentCard();
    if (!card || !this.sessionId()) return;
    this.reviewService.submitRating(this.sessionId()!, card.id, rating).subscribe();
    this.advance();
  }

  skipCard(): void {
    this.advance();
  }

  playAudio(event: Event): void {
    event.stopPropagation();
    const card = this.currentCard();
    if (!card) return;
    const text =
      (card.content.article ? card.content.article + ' ' : '') +
      card.content.back;
    this.audioService.speak(text, 'de-DE').subscribe();
  }

  flagCard(): void {
    /* TODO: implement flag via API */
  }

  exitSession(): void {
    this.navCtrl.back();
  }

  activeCategoryNames(): string {
    return 'All categories';
  }

  private advance(): void {
    this.isFlipped.set(false);
    const next = this.currentIndex() + 1;
    if (next >= this.queue().length) {
      this.reviewService.completeSession(this.sessionId()!).subscribe();
      this.sessionComplete.set(true);
    } else {
      this.currentIndex.set(next);
    }
  }
}
