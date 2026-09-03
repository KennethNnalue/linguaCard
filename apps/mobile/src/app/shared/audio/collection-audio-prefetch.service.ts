import { inject, Injectable } from '@angular/core';
import type { Card, CardView, WordAudioResolveRequest } from '@lingua-card/shared/domain';
import { AiAudioCacheService } from '../../features/ai/audio/ai-audio-cache.service';
import { WordAudioApiService } from './word-audio-api.service';
import { WordAudioService } from './word-audio.service';
import { AudioReadinessStore } from './audio-readiness.store';
import { normalizeForAudio } from './normalize';

const CHUNK_SIZE = 50;
type ResolvedAudioRequest = WordAudioResolveRequest & {language: string};

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
  private readonly api       = inject(WordAudioApiService);
  private readonly cache     = inject(AiAudioCacheService);
  private readonly readiness = inject(AudioReadinessStore);
  private readonly wordAudio = inject(WordAudioService);

  /**
   * Fire-and-forget. Do NOT await from import flows.
   * Caller continues immediately; audio arrives in the background.
   */
  prefetchCollection(cards: Card[]): void {
    this._run(this._buildWordList(cards)).catch(err => console.warn('[AudioPrefetch] failed:', err));
  }

  prefetchLearningItems(items: readonly CardView[], language: string): void {
    this._run(learningItemAudioRequests(items, language))
      .catch(err => console.warn('[AudioPrefetch] failed:', err));
  }

  private async _run(requests: readonly WordAudioResolveRequest[]): Promise<void> {
    const words = this._uniqueRequests(requests);

    // Mark all as pending immediately so the progress bar appears right away.
    // Skip words already 'ready' so a re-visit doesn't reset completed state.
    for (const w of words) {
      const key = this._cacheKey(w.text, w.language);
      if (this.readiness.statusFor(key) !== 'ready') {
        this.readiness.markPending(key);
      }
    }

    // Build a lookup from normalizedText → originalKey so the API response
    // (which echoes normalizedText) maps back to the correct readiness key.
    // This prevents the mismatch where displayText differs from the sent text.
    const keyByNormalized = new Map<string, string>();
    for (const w of words) {
      keyByNormalized.set(
        `${w.language}:${normalizeForAudio(w.text, w.language)}`,
        this._cacheKey(w.text, w.language),
      );
    }

    for (let i = 0; i < words.length; i += CHUNK_SIZE) {
      const chunk = words.slice(i, i + CHUNK_SIZE);
      try {
        const resp = await this.api.batchResolve(chunk);
        // Collect entries to write into the in-memory URL cache in one call.
        const memoryEntries: { normalizedText: string; language: string; url: string }[] = [];

        for (const item of resp.results) {
          // Resolve the key using normalizedText from the API response, which
          // matches the normalizedText stored in our keyByNormalized map.
          const key = keyByNormalized.get(`${item.wordAudio.language}:${item.wordAudio.normalizedText}`)
            ?? this._cacheKey(item.wordAudio.displayText, item.wordAudio.language);

          const audioUrl = item.wordAudio.audioUrl;
          if (!audioUrl) {
            this.readiness.markFailed(key);
            continue;
          }
          try {
            // Check device cache first — if file already on disk, use local path
            // and skip the network download entirely.
            const existing = await this.cache.getFromCache(key);
            if (existing) {
              this.readiness.markReady(key);
              memoryEntries.push({ normalizedText: item.wordAudio.normalizedText, language: item.wordAudio.language, url: existing });
              continue;
            }
            const localUrl = await this.cache.saveFromUrl(key, audioUrl);
            const resolvedUrl = localUrl ?? audioUrl;
            this.readiness.markReady(key);
            memoryEntries.push({ normalizedText: item.wordAudio.normalizedText, language: item.wordAudio.language, url: resolvedUrl });
          } catch {
            this.readiness.markFailed(key);
          }
        }

        // Warm the in-memory URL map so the first play() after prefetch is
        // an instant hit instead of falling back to Web Speech API.
        if (memoryEntries.length > 0) {
          this.wordAudio.populateMemoryCache(memoryEntries);
        }

        // Mark any words in this chunk that got no result as failed
        // (backend returned fewer results than sent — e.g. generation error).
        const returnedNormalized = new Set(resp.results.map(r => r.wordAudio.normalizedText));
        for (const w of chunk) {
          const n = normalizeForAudio(w.text, w.language);
          if (!returnedNormalized.has(n)) {
            this.readiness.markFailed(this._cacheKey(w.text, w.language));
          }
        }
      } catch (err) {
        console.warn('[AudioPrefetch] chunk failed:', err);
        for (const w of chunk) {
          this.readiness.markFailed(this._cacheKey(w.text, w.language));
        }
      }
    }
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

  private _uniqueRequests(requests: readonly WordAudioResolveRequest[]): ResolvedAudioRequest[] {
    const unique = new Map<string, ResolvedAudioRequest>();
    for (const request of requests) {
      const language = request.language ?? 'de-DE';
      const key = `${language}:${normalizeForAudio(request.text, language)}`;
      if (!unique.has(key)) unique.set(key, {...request, language});
    }
    return [...unique.values()];
  }

  private _cacheKey(text: string, language: string): string {
    return `wa-${language}-${normalizeForAudio(text, language)}`;
  }
}
