import { inject, Injectable } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import type { ScheduledCard } from '@lingua-card/shared/domain';
import type { ReviewSessionSource } from '../domain/review-domain';
import { ReviewPage } from '../pages/review/review.page';
import { ReviewStore } from '../store/review.store';
import { ReviewRoute } from '../models/review.model';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';

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
    const stopTrackingViewport = this.trackVisibleViewport(modal);
    let completed = false;
    try {
      await modal.present();
      await this.prepareTypingInput(modal);
      const result = await modal.onWillDismiss<{ completed?: boolean }>();
      completed = result.data?.completed === true;
    } finally {
      stopTrackingViewport();
      await this.restoreKeyboardBehavior();
    }
    if (completed) await this.router.navigate([ReviewRoute.SUMMARY]);
    return completed;
  }

  private async prepareTypingInput(modal: HTMLIonModalElement): Promise<void> {
    if (this.reviewStore.session()?.definition.mode !== 'typing') return;
    const input = await this.findTypingInput(modal);
    if (!input) return;
    if (Capacitor.isNativePlatform()) {
      await Keyboard.setScroll({ isDisabled: true }).catch(() => undefined);
    }
    input.focus({ preventScroll: true });
    if (Capacitor.getPlatform() === 'android') {
      await Keyboard.show().catch(() => undefined);
    }
  }

  private async findTypingInput(modal: HTMLIonModalElement): Promise<HTMLInputElement | null> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const input = modal.querySelector<HTMLInputElement>('.ft-input');
      if (input) return input;
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
    return null;
  }

  private async restoreKeyboardBehavior(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    await Keyboard.setScroll({ isDisabled: false }).catch(() => undefined);
  }

  private trackVisibleViewport(modal: HTMLIonModalElement): () => void {
    if (Capacitor.isNativePlatform()) return () => undefined;
    const viewport = window.visualViewport;
    const updateHeight = () => {
      const height = viewport?.height ?? window.innerHeight;
      modal.style.setProperty('--review-player-visible-height', `${Math.round(height)}px`);
    };
    updateHeight();
    viewport?.addEventListener('resize', updateHeight);
    window.addEventListener('resize', updateHeight);
    return () => {
      viewport?.removeEventListener('resize', updateHeight);
      window.removeEventListener('resize', updateHeight);
      modal.style.removeProperty('--review-player-visible-height');
    };
  }
}
