import { inject, Injectable } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import type { ScheduledCard } from '@lingua-card/shared/domain';
import type { ReviewSessionSource } from '../domain/review-domain';
import { ReviewPage } from '../pages/review/review.page';
import { ReviewStore } from '../store/review.store';
import { ReviewRoute } from '../models/review.model';

@Injectable({ providedIn: 'root' })
export class ReviewPlayerService {
  private readonly modalController = inject(ModalController);
  private readonly reviewStore = inject(ReviewStore);
  private readonly router = inject(Router);

  async open(cards: readonly ScheduledCard[], source: ReviewSessionSource): Promise<boolean> {
    if (cards.length === 0) return false;
    const result = await this.reviewStore.startSessionForCards(source, cards.map(card => card.id));
    if (result.kind !== 'started') return false;
    return this.present();
  }

  async openSource(source: ReviewSessionSource, limit: number): Promise<boolean> {
    const result = await this.reviewStore.startSession(source, limit);
    if (result.kind !== 'started') return false;
    return this.present();
  }

  async resume(sessionId: string): Promise<boolean> {
    if (!await this.reviewStore.resumeSession(sessionId)) return false;
    return this.present();
  }

  private async present(): Promise<boolean> {
    const modal = await this.modalController.create({
      component: ReviewPage,
      cssClass: 'lc-review-player-modal',
      backdropDismiss: false,
      keyboardClose: false,
    });
    await modal.present();
    const result = await modal.onWillDismiss<{ completed?: boolean }>();
    const completed = result.data?.completed === true;
    if (completed) await this.router.navigate([ReviewRoute.SUMMARY]);
    return completed;
  }
}
