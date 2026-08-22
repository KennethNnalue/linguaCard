import {inject, Injectable} from '@angular/core';
import {ModalController} from '@ionic/angular/standalone';
import {Router} from '@angular/router';
import type {ScheduledCard} from '@lingua-card/shared/domain';
import type {ReviewSessionSource} from '../domain/review-domain';
import {ReviewPage} from '../pages/review/review.page';
import {ReviewStore} from '../store/review.store';
import {ReviewRoute} from '../models/review.model';
import {Capacitor} from '@capacitor/core';
import {Keyboard} from '@capacitor/keyboard';
import {ReviewPrefsService} from './review-prefs.service';

@Injectable({providedIn: 'root'})
export class ReviewPlayerService {
  private readonly modalController = inject(ModalController);
  private readonly reviewStore = inject(ReviewStore);
  private readonly router = inject(Router);
  private readonly reviewPrefs = inject(ReviewPrefsService);

  async open(cards: readonly ScheduledCard[], source: ReviewSessionSource): Promise<boolean> {
    if (cards.length === 0) return false;
    return this.launch(async () => {
      const result = await this.reviewStore.startSessionForCards(source, cards.map(card => card.id));
      return result.kind === 'started';
    });
  }

  async openSource(source: ReviewSessionSource, limit: number): Promise<boolean> {
    return this.launch(async () => {
      const result = await this.reviewStore.startSession(source, limit);
      return result.kind === 'started';
    });
  }

  async resume(sessionId: string): Promise<boolean> {
    return this.launch(() => this.reviewStore.resumeSession(sessionId));
  }

  private async launch(startSession: () => Promise<boolean>): Promise<boolean> {
    const focusBridge = this.captureIosTypingFocus();
    try {
      return await this.present(focusBridge, startSession);
    } finally {
      focusBridge?.remove();
    }
  }

  private async present(focusBridge: HTMLInputElement | null, startSession: () => Promise<boolean>): Promise<boolean> {
    const launchInTypingMode = this.reviewPrefs.mode() === 'type';
    const modal = await this.modalController.create({
      component: ReviewPage,
      componentProps: {launchInTypingMode},
      cssClass: 'lc-review-player-modal',
      backdropDismiss: false,
      keyboardClose: false,
      // iOS must keep the user-gesture input focused while the first card loads;
      // Ionic's focus trap would move focus and dismiss the software keyboard.
      focusTrap: focusBridge === null,
    });
    const stopTrackingViewport = this.trackVisibleViewport(modal);
    let disconnectKeyboardBridge: () => void = () => undefined;
    let completed = false;
    try {
      const presenting = modal.present();
      if (focusBridge) {
        const typingInput = await this.findTypingInput(modal);
        if (typingInput) {
          disconnectKeyboardBridge = this.connectIosKeyboardBridge(modal, focusBridge, typingInput);
        } else {
          focusBridge.remove();
          modal.focusTrap = true;
        }
      }
      const sessionStarted = startSession();
      await presenting;
      if (!focusBridge) await this.prepareTypingInput(modal, launchInTypingMode);
      if (!await sessionStarted) {
        await modal.dismiss(undefined, 'session-unavailable');
        return false;
      }
      const result = await modal.onWillDismiss<{ completed?: boolean }>();
      completed = result.data?.completed === true;
    } finally {
      disconnectKeyboardBridge();
      stopTrackingViewport();
      await this.restoreKeyboardBehavior();
    }
    if (completed) await this.router.navigate([ReviewRoute.SUMMARY]);
    return completed;
  }

  private async prepareTypingInput(modal: HTMLIonModalElement, launchInTypingMode: boolean): Promise<void> {
    if (!launchInTypingMode) return;
    const input = await this.findTypingInput(modal);
    if (!input) return;
    if (Capacitor.isNativePlatform()) {
      await Keyboard.setScroll({isDisabled: true}).catch(() => undefined);
    }
    input.focus();
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

  private connectIosKeyboardBridge(
    modal: HTMLIonModalElement,
    bridge: HTMLInputElement,
    typingInput: HTMLInputElement,
  ): () => void {
    let connected = true;
    const disconnect = () => {
      if (!connected) return;
      connected = false;
      bridge.removeEventListener('input', mirrorInput);
      bridge.removeEventListener('keydown', forwardEnter);
      bridge.removeEventListener('blur', disconnect);
      typingInput.removeEventListener('focus', disconnect);
      modal.removeEventListener('click', finishTyping);
      bridge.remove();
      modal.focusTrap = true;
    };
    const mirrorInput = () => {
      typingInput.value = bridge.value;
      typingInput.dispatchEvent(new Event('input', {bubbles: true}));
    };
    const forwardEnter = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return;
      const forwarded = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        bubbles: true,
        cancelable: true,
      });
      if (!typingInput.dispatchEvent(forwarded)) event.preventDefault();
    };
    const finishTyping = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('.ft-cta, .ft-dont-know')) disconnect();
    };
    bridge.addEventListener('input', mirrorInput);
    bridge.addEventListener('keydown', forwardEnter);
    bridge.addEventListener('blur', disconnect);
    typingInput.addEventListener('focus', disconnect);
    modal.addEventListener('click', finishTyping);
    return disconnect;
  }

  private async restoreKeyboardBehavior(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    await Keyboard.setScroll({isDisabled: false}).catch(() => undefined);
  }

  private captureIosTypingFocus(): HTMLInputElement | null {
    if (Capacitor.isNativePlatform() || this.reviewPrefs.mode() !== 'type' || !this.isIosBrowser()) return null;
    const input = document.createElement('input');
    input.className = 'lc-ios-keyboard-focus-bridge';
    input.type = 'text';
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
    input.setAttribute('autocomplete', 'off');
    document.body.append(input);
    input.focus({preventScroll: true});
    return input;
  }

  private isIosBrowser(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  private trackVisibleViewport(modal: HTMLIonModalElement): () => void {
    if (Capacitor.isNativePlatform()) return () => undefined;
    const viewport = window.visualViewport;
    const initialScrollY = window.scrollY;
    document.documentElement.classList.add('lc-review-player-open');
    document.body.classList.add('lc-review-player-open');
    const updateViewport = () => {
      const height = viewport?.height ?? window.innerHeight;
      modal.style.setProperty('--review-player-visible-height', `${Math.ceil(height)}px`);
      this.pinReviewPlayerToViewport(modal);
    };
    updateViewport();
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    return () => {
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
      modal.style.removeProperty('--review-player-visible-height');
      document.documentElement.classList.remove('lc-review-player-open');
      document.body.classList.remove('lc-review-player-open');
      window.scrollTo({top: initialScrollY, left: 0, behavior: 'instant'});
    };
  }

  private pinReviewPlayerToViewport(modal: HTMLIonModalElement): void {
    const scrollingElement = document.scrollingElement;
    if (scrollingElement) scrollingElement.scrollTop = 0;
    const content = modal.querySelector<HTMLIonContentElement>('ion-content');
    if (content) void content.scrollToTop(0);
  }
}
