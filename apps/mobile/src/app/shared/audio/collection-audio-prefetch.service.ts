import { inject, Injectable } from '@angular/core';
import type { Card, CardView, WordAudioResolveRequest } from '@lingua-card/shared/domain';
import { WordAudioService } from './word-audio.service';

export function learningItemAudioRequests(
  items: readonly CardView[],
  language: string,
): WordAudioResolveRequest[] {
  return items.flatMap(item => {
    const article = item.lexeme.grammar['article'];
    const headword = typeof article === 'string' && article.trim()
      ? `${article.trim()} ${item.lexeme.text}`
      : item.lexeme.text;
    return [
      {text: headword, language},
      ...item.examples
        .filter(example => example.targetText.trim())
        .map(example => ({text: example.targetText.trim(), language})),
    ];
  });
}

@Injectable({ providedIn: 'root' })
export class CollectionAudioPrefetchService {
  private readonly wordAudio = inject(WordAudioService);

  /**
   * Fire-and-forget. Do NOT await from import flows.
   * Caller continues immediately; audio arrives in the background.
   */
  prefetchCollection(cards: Card[]): void {
    this._prefetch(this._buildWordList(cards));
  }

  prefetchLearningItems(items: readonly CardView[], language: string): void {
    this._prefetch(learningItemAudioRequests(items, language));
  }

  private _prefetch(requests: readonly WordAudioResolveRequest[]): void {
    void this.wordAudio.preWarm(requests)
      .catch(error => console.warn('[AudioPrefetch] failed:', error));
  }

  /** Builds the flat list of texts to fetch: word + examples + plural + synonym examples per card. */
  private _buildWordList(cards: Card[]): { text: string; language: string }[] {
    const items: { text: string; language: string }[] = [];
    for (const c of cards) {
      items.push({
        text: (c.content.article ? `${c.content.article} ` : '') + c.content.back,
        language: 'de-DE',
      });
      for (const ex of c.content.examples ?? []) {
        if (ex.target?.trim()) {
          items.push({ text: ex.target.trim(), language: 'de-DE' });
        }
      }
      if (c.content.plural) {
        items.push({ text: c.content.plural, language: 'de-DE' });
      }
      for (const syn of c.content.synonyms ?? []) {
        if (syn.example?.trim()) {
          items.push({ text: syn.example.trim(), language: 'de-DE' });
        }
      }
    }
    return items;
  }
}
