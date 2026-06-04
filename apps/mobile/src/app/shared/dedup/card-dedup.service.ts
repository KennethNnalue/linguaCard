import { computed, inject, Injectable } from '@angular/core';
import type { Card } from '@lingua-card/shared/domain';
import { CardStore } from '../../features/vault/store/card.store';

// Articles that Phase 1 extraction may embed in the back field (e.g. "der Hund")
const GERMAN_ARTICLES = ['der ', 'die ', 'das '];

@Injectable({ providedIn: 'root' })
export class CardDedupService {
  private readonly cardStore = inject(CardStore);

  /**
   * Full-key index: article + back (lowercase trimmed).
   * Used for enriched words where article is confirmed by AI enrichment.
   */
  readonly index = computed(() => this._buildIndex(this.cardStore.cards()));

  /**
   * Back-only index: just the word, no article.
   * Used for raw pending words from Phase 1 extraction where:
   *   1. article may be embedded in back ("der Hund" → back="der Hund")
   *   2. article from AI extraction is not confirmed (may be wrong or missing)
   * A match on the bare word is sufficient to detect a duplicate — article
   * mismatch is tolerated for pending words.
   */
  readonly backOnlyIndex = computed(() => this._buildBackOnlyIndex(this.cardStore.cards()));

  /** O(1) lookup using full article+back key. For enriched/confirmed words. */
  check(article: string | null | undefined, back: string): Card | null {
    return this.index().get(this.normalizeKey(article, back)) ?? null;
  }

  /**
   * Batch check using full article+back key.
   * For enriched words (CSV import, image import enriched path).
   * Pass `cards` to check against a specific list instead of the store index
   * (use this when the store may be stale, e.g. after a deletion).
   */
  checkBatch(words: { back: string; article?: string | null }[], cards?: Card[]): (Card | null)[] {
    const idx = cards ? this._buildIndex(cards) : this.index();
    return words.map(w => idx.get(this.normalizeKey(w.article, w.back)) ?? null);
  }

  /**
   * Single lookup using back-only key (no article).
   * Fallback for manual add/edit when the vault card may have a different or
   * absent article — e.g. verbs stored without article, or article-mismatch
   * from Phase 1 image import.
   */
  checkByBackOnly(back: string): Card | null {
    return this.backOnlyIndex().get(this.normalizeBack(back)) ?? null;
  }

  /**
   * Batch check using back-only key (no article).
   * For Phase 1 raw/pending words where:
   * - back may include the article prefix ("der Hund" → strips to "hund")
   * - article from extraction is unreliable
   * Pass `cards` to check against a specific list instead of the store index.
   */
  checkBatchByBackOnly(words: { back: string }[], cards?: Card[]): (Card | null)[] {
    const idx = cards ? this._buildBackOnlyIndex(cards) : this.backOnlyIndex();
    return words.map(w => idx.get(this.normalizeBack(w.back)) ?? null);
  }

  private _buildIndex(cards: Card[]): Map<string, Card> {
    const map = new Map<string, Card>();
    for (const card of cards) {
      const key = this.normalizeKey(card.content.article, card.content.back);
      if (!map.has(key)) map.set(key, card);
    }
    return map;
  }

  private _buildBackOnlyIndex(cards: Card[]): Map<string, Card> {
    const map = new Map<string, Card>();
    for (const card of cards) {
      const key = this.normalizeBack(card.content.back);
      if (!map.has(key)) map.set(key, card);
    }
    return map;
  }

  private normalizeKey(article: string | null | undefined, back: string): string {
    const w = back.toLowerCase().trim();
    const a = article?.toLowerCase().trim() ?? '';
    return a ? `${a} ${w}` : w;
  }

  /**
   * Normalize a raw extracted word for back-only matching:
   * 1. Lowercase + trim
   * 2. Strip leading article prefix ("der Hund" → "hund")
   * 3. Strip trailing grammar annotation after the first comma
   *    ("Fahrkarte, -n" → "fahrkarte", "Fluss, Flüsse" → "fluss")
   * 4. Strip parenthetical notes ("Gepäck (Sg.)" → "gepäck")
   *
   * This makes "die Fahrkarte, -n" match a vault card stored as "Fahrkarte, -n"
   * or "Fahrkarte" regardless of how enrichment formatted it.
   */
  private normalizeBack(back: string): string {
    let w = back.toLowerCase().trim();
    // Strip article prefix
    for (const art of GERMAN_ARTICLES) {
      if (w.startsWith(art)) {
        w = w.slice(art.length).trim();
        break;
      }
    }
    // Strip trailing plural/grammar annotation (", -n", ", Flüsse", " (Sg.)" etc.)
    w = w.replace(/\s*\(.*?\)\s*$/, '').trim(); // parenthetical at end
    w = w.replace(/,.*$/, '').trim();            // everything after first comma
    return w;
  }
}
