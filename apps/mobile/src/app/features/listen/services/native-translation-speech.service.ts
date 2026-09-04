import {Injectable} from '@angular/core';
import {QueueStrategy, TextToSpeech} from '@capacitor-community/text-to-speech';

@Injectable({providedIn: 'root'})
export class NativeTranslationSpeechService {
  private finishActive: (() => void) | null = null;
  private generation = 0;

  async speak(text: string, language: string, rate = 1): Promise<void> {
    const generation = ++this.generation;
    this.finishActive?.();
    this.finishActive = null;
    await TextToSpeech.stop().catch(() => undefined);
    if (generation !== this.generation) return;

    let finishCancellation!: () => void;
    const cancellation = new Promise<void>(resolve => {
      finishCancellation = resolve;
    });
    this.finishActive = finishCancellation;
    try {
      await Promise.race([
        TextToSpeech.speak({
          text,
          lang: language,
          rate: Math.min(2, Math.max(0.5, rate)),
          pitch: 1,
          volume: 1,
          category: 'playback',
          queueStrategy: QueueStrategy.Flush,
        }),
        cancellation,
      ]);
    } finally {
      if (this.finishActive === finishCancellation) this.finishActive = null;
    }
  }

  stop(): void {
    this.generation += 1;
    const finish = this.finishActive;
    this.finishActive = null;
    finish?.();
    void TextToSpeech.stop().catch(() => undefined);
  }
}
