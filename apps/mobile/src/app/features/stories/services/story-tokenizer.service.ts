import { Injectable } from '@angular/core';
import type { StorySentence } from '@lingua-card/shared/domain';
import type { SentenceWordRange, WordToken } from '../models/reader.model';

/**
 * Pure, stateless tokenisation helpers shared by both story readers.
 *
 * Tokenisation and the karaoke word-timestamp ranges are derived from the same
 * sentence source so the rendered tokens and the audio-driven highlight stay in
 * step. Highlighting assumes `wordTimestamps` are ordered and roughly 1:1 with
 * the whitespace-split words of each sentence.
 */
@Injectable({ providedIn: 'root' })
export class StoryTokenizerService {
  /** Split a sentence into render tokens, flagging vocab words for tap/highlight. */
  tokenise(sentence: StorySentence, vocabBases: ReadonlySet<string>): WordToken[] {
    return sentence.german
      .split(/(\s+)/)
      .filter(t => t.trim().length > 0)
      .map((text, wordIdx) => ({
        text,
        wordIdx,
        isVocab: vocabBases.has(this.stripPunctuation(text).toLowerCase()),
      }));
  }

  /** Strip leading/trailing quotes and trailing punctuation for vocab lookups. */
  stripPunctuation(word: string): string {
    return word.replace(/^[«"'„]+|[»"'.,!?;:]+$/g, '');
  }

  /**
   * Map each sentence to its half-open [start, end) range over the flat
   * `wordTimestamps` array, derived from cumulative whitespace word counts.
   */
  computeSentenceWordRanges(
    sentences: readonly StorySentence[],
    totalTimestamps: number,
  ): SentenceWordRange[] {
    const ranges: SentenceWordRange[] = [];
    let cursor = 0;
    for (const sent of sentences) {
      const sentWords = sent.german.split(/\s+/).filter(Boolean);
      const start = cursor;
      const end = Math.min(cursor + sentWords.length, totalTimestamps);
      ranges.push({ start, end });
      cursor = end;
    }
    return ranges;
  }
}
