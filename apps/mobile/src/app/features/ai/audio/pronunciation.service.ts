import { Injectable, inject, signal } from '@angular/core';
import type { Card } from '@lingua-card/shared/domain';
import { AiOrchestrationService } from '../orchestration/ai-orchestration.service';
import { AiAudioCacheService } from './ai-audio-cache.service';
import { AudioService } from '../../../shared/audio/audio.service';

@Injectable({ providedIn: 'root' })
export class PronunciationService {
  private readonly ai = inject(AiOrchestrationService);
  private readonly cache = inject(AiAudioCacheService);
  private readonly fallback = inject(AudioService);

  readonly isLoading = signal(false);

  async play(card: Card): Promise<void> {
    const cacheKey = `pronunciation-${card.id}`;

    const cached = await this.cache.getFromCache(cacheKey);
    if (cached) {
      new Audio(cached).play();
      return;
    }

    this.isLoading.set(true);
    try {
      const speech = await this.ai.generatePronunciation({
        cardId: card.id,
        word: card.content.back,
        language: 'de-DE',
      });

      const audioUrl = await this.cache.saveBuffer(cacheKey, speech.audioBuffer);
      this.isLoading.set(false);
      new Audio(audioUrl).play();
    } catch {
      this.isLoading.set(false);
      this.fallback.speak(card.content.back, 'de-DE', 0.85).subscribe();
    }
  }
}
