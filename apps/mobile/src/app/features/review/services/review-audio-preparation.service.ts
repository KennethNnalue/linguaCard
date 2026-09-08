import { inject, Injectable } from '@angular/core';
import type { ScheduledCard, WordAudioResolveRequest } from '@lingua-card/shared/domain';
import {
  cardPronunciationText,
  WordAudioService,
  type AudioPreWarmResult,
} from '../../../shared/audio/word-audio.service';

export function reviewAudioRequests(cards: readonly ScheduledCard[]): WordAudioResolveRequest[] {
  return cards.flatMap(card => [
    {
      text: cardPronunciationText(card),
      language: 'de-DE',
    },
    ...(card.content.examples ?? [])
      .filter(example => example.target.trim())
      .map(example => ({ text: example.target.trim(), language: 'de-DE' })),
    ...(card.content.synonyms ?? [])
      .filter(synonym => synonym.example.trim())
      .map(synonym => ({ text: synonym.example.trim(), language: 'de-DE' })),
  ]);
}

@Injectable({ providedIn: 'root' })
export class ReviewAudioPreparationService {
  private readonly wordAudio = inject(WordAudioService);

  prepare(cards: readonly ScheduledCard[]): Promise<AudioPreWarmResult> {
    return this.wordAudio.preWarm(reviewAudioRequests(cards));
  }
}
