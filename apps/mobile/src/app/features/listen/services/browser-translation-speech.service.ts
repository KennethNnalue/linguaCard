import {DestroyRef, inject, Injectable} from '@angular/core';
import {Capacitor} from '@capacitor/core';

@Injectable({providedIn: 'root'})
export class BrowserTranslationSpeechService {
  private readonly destroyRef = inject(DestroyRef);
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private finishActive: (() => void) | null = null;

  constructor() {
    if (Capacitor.isNativePlatform()) return;
    // Mobile speech synthesis needs its own activation inside a user gesture;
    // unlocking the shared HTML audio element does not activate this API.
    const prime = () => {
      if (!window.speechSynthesis || this.activeUtterance) return;
      const utterance = new SpeechSynthesisUtterance('.');
      utterance.volume = 0;
      window.speechSynthesis.speak(utterance);
      window.removeEventListener('click', prime, true);
      window.removeEventListener('keydown', prime, true);
    };
    window.addEventListener('click', prime, true);
    window.addEventListener('keydown', prime, true);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('click', prime, true);
      window.removeEventListener('keydown', prime, true);
      this.stop();
    });
  }

  speak(text: string, language: string, rate = 1): Promise<void> {
    this.stop();
    const synthesis = window.speechSynthesis;
    if (!synthesis) return Promise.reject(new Error('Translation speech is unavailable in this browser.'));
    if (!text.trim()) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language;
      utterance.rate = Math.min(2, Math.max(0.5, rate));
      this.activeUtterance = utterance;
      let deadline: ReturnType<typeof setTimeout>;
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        utterance.onstart = null;
        utterance.onend = null;
        utterance.onerror = null;
        this.activeUtterance = null;
        this.finishActive = null;
        if (error) {
          synthesis.cancel();
          reject(error);
        } else {
          resolve();
        }
      };
      this.finishActive = () => finish();
      const fail = () => finish(new Error('Translation speech did not complete. Tap Play to try again.'));
      deadline = setTimeout(fail, 5000);
      utterance.onstart = () => {
        clearTimeout(deadline);
        const durationMs = Math.max(30000, text.length * 200 / utterance.rate);
        deadline = setTimeout(fail, durationMs);
      };
      utterance.onend = () => finish();
      utterance.onerror = event => finish(new Error(`Translation speech failed: ${event.error}`));
      try {
        synthesis.resume();
        synthesis.speak(utterance);
      } catch (error: unknown) {
        finish(error instanceof Error ? error : new Error('Translation speech failed.'));
      }
    });
  }

  stop(): void {
    this.finishActive?.();
    window.speechSynthesis?.cancel();
  }
}
