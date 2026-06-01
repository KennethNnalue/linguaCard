import { Injectable, inject } from '@angular/core';
import type { Card } from '@lingua-card/shared/domain';
import { WordAudioService } from '../../../shared/audio/word-audio.service';

/**
 * Thin compatibility wrapper around WordAudioService.
 * All methods are @deprecated — inject WordAudioService directly instead.
 *
 * This wrapper exists so existing consumers continue working without
 * requiring a big-bang refactor. Remove after LC-WA08 is complete.
 */
@Injectable({ providedIn: 'root' })
export class PronunciationService {
  private readonly wordAudio = inject(WordAudioService);

  readonly isLoading = this.wordAudio.isLoading;

  /** @deprecated Use WordAudioService.playCard(card) */
  async play(card: Card): Promise<void> {
    return this.wordAudio.playCard(card);
  }

  /** @deprecated Use WordAudioService.play(text, language) */
  async playText(text: string, language = 'de-DE', _cardId?: string): Promise<void> {
    return this.wordAudio.play(text, language);
  }

  /** @deprecated Use WordAudioService.playAsPromise(text, language) */
  async playTextAsPromise(text: string, language = 'de-DE', _cardId?: string): Promise<void> {
    return this.wordAudio.playAsPromise(text, language);
  }
}
