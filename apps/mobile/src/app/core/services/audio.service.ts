import { Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';

// Chrome (US spelling) and some browsers (British spelling) differ — include both.
// These fire when stop() or cancel() is called externally, not real playback errors.
const IGNORABLE_ERRORS = new Set(['canceled', 'cancelled', 'interrupted']);

@Injectable({ providedIn: 'root' })
export class AudioService {
  private readonly _isPlaying = signal(false);
  readonly isPlaying = this._isPlaying.asReadonly();

  speak(text: string, lang = 'de-DE', rate = 1.0): Observable<void> {
    return new Observable(observer => {
      if (!('speechSynthesis' in window)) {
        observer.complete();
        return;
      }

      let settled = false;

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        this._isPlaying.set(false);
        fn();
      };

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = rate;

      utterance.onstart = () => {
        if (!settled) this._isPlaying.set(true);
      };

      utterance.onend = () =>
        settle(() => {
          observer.next();
          observer.complete();
        });

      utterance.onerror = (e: SpeechSynthesisErrorEvent) =>
        settle(() => {
          // 'cancelled'/'interrupted' fire when stop() is called — not real errors
          if (IGNORABLE_ERRORS.has(e.error)) {
            observer.complete();
          } else {
            observer.error(e);
          }
        });

      window.speechSynthesis.speak(utterance);

      // Chrome can stall and never fire onend (tab loses focus, voices not loaded,
      // rapid cancel+speak calls). A 10-second safety valve prevents _speakPromise
      // from hanging forever and blocking the playback loop.
      const timeoutId = setTimeout(() => settle(() => observer.complete()), 10_000);

      // No cancel() in teardown — Chrome fires onerror('cancelled') async, so a
      // teardown cancel would race with and kill the next queued utterance.
      // External stop is handled by stop() / AudioService callers.
      return () => {
        clearTimeout(timeoutId);
        settled = true;
        this._isPlaying.set(false);
      };
    });
  }

  stop(): void {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this._isPlaying.set(false);
  }
}
