import { Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';

// Chrome (US spelling) and some browsers (British spelling) differ — include both.
// These fire when stop() or cancel() is called externally, not real playback errors.
const IGNORABLE_ERRORS = new Set(['canceled', 'cancelled', 'interrupted']);

@Injectable({ providedIn: 'root' })
export class AudioService {
  private readonly _isPlaying = signal(false);
  readonly isPlaying = this._isPlaying.asReadonly();

  // Eagerly trigger voice loading on construction so they are ready before the
  // first speak() call. Chrome returns an empty array until voiceschanged fires;
  // calling getVoices() now kicks off the async load.
  constructor() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
  }

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
          if (IGNORABLE_ERRORS.has(e.error)) {
            observer.complete();
          } else {
            observer.error(e);
          }
        });

      // Call cancel() then speak() synchronously in the same tick.
      // The old code deferred speak() via setTimeout(0) to avoid a Chrome bug
      // where cancel()+speak() in the same tick silently drops the utterance —
      // but the setTimeout breaks the user-gesture requirement for Speech Synthesis
      // API, causing silent no-ops on Chrome. The correct fix is to call speak()
      // synchronously without cancel(), letting Chrome queue the utterance. If
      // something is already playing, it will be interrupted (which is fine —
      // only one word plays at a time in this app).
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);

      // Safety valve: if onend never fires (Chrome stall, tab unfocused, no voices),
      // resolve after 10 seconds so the listen playlist never hangs indefinitely.
      const timeoutId = setTimeout(() => settle(() => observer.complete()), 10_000);

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
