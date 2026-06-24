import { Injectable } from '@angular/core';
import type { StorySentence, WordTimestamp } from '@lingua-card/shared/domain';
import type {
  SentenceFractionBound,
  SentencePlan,
  SentenceTimeRange,
  SentenceWordRange,
  WordToken,
} from '../models/reader.model';

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

  /**
   * Build a {@link SentencePlan} describing where each sentence's audio falls.
   *
   * Two strategies:
   *
   * - **absolute** — when real word-level `timestamps` exist and roughly match the
   *   source word count (future Whisper integration). Each sentence's range runs
   *   from its first word's `startMs` to its last word's `endMs`. Precise.
   *
   * - **fraction** — the default today (Google TTS only, no timestamps). Each
   *   sentence gets a cumulative [startFrac, endFrac) of the *total* duration,
   *   weighted by text length. The engine multiplies these fractions by the audio
   *   element's **real** duration at playback time — so highlighting stays paced to
   *   the actual audio even if the stored `audioDurationMs` is inaccurate (the
   *   backend estimates it from byte length and can be well off). Approximate at
   *   the sentence level (±~1 sentence), but never accumulates drift: the last
   *   sentence ends exactly when the audio does.
   */
  computeSentencePlan(
    sentences: readonly StorySentence[],
    durationMs: number,
    timestamps?: readonly WordTimestamp[],
  ): SentencePlan {
    if (sentences.length === 0) return { kind: 'fraction', bounds: [] };

    const wordCounts = sentences.map(s => s.german.split(/\s+/).filter(Boolean).length);
    const totalWords = wordCounts.reduce((a, b) => a + b, 0);

    // Prefer real timestamps only when they roughly match the source word count —
    // a large mismatch (Whisper dropped/merged words) makes per-sentence indexing
    // drift, so we fall back to the proportional estimate in that case.
    const aligned =
      !!timestamps &&
      timestamps.length > 0 &&
      totalWords > 0 &&
      Math.abs(timestamps.length - totalWords) / totalWords <= 0.15;

    if (aligned && timestamps) {
      const ranges: SentenceTimeRange[] = [];
      let cursor = 0;
      for (const count of wordCounts) {
        const start = cursor;
        const end = Math.min(cursor + count, timestamps.length);
        const first = timestamps[start];
        const last = timestamps[Math.max(start, end - 1)];
        ranges.push({
          startMs: first?.startMs ?? 0,
          endMs: last?.endMs ?? durationMs,
        });
        cursor = end;
      }
      return { kind: 'absolute', ranges };
    }

    // Estimate: distribute the timeline by sentence character length so longer
    // sentences get a proportionally longer slice (more robust than word count for
    // German, where word lengths vary widely). Emit fractions (0–1) so the engine
    // can resolve them against the real audio duration.
    const charCounts = sentences.map(s => Math.max(1, s.german.trim().length));
    const totalChars = charCounts.reduce((a, b) => a + b, 0);
    const bounds: SentenceFractionBound[] = [];
    let cursorFrac = 0;
    sentences.forEach((_, i) => {
      const startFrac = cursorFrac;
      // Last sentence absorbs rounding so the final bound ends exactly at 1.
      const endFrac =
        i === sentences.length - 1 ? 1 : startFrac + charCounts[i] / totalChars;
      bounds.push({ startFrac, endFrac });
      cursorFrac = endFrac;
    });
    return { kind: 'fraction', bounds };
  }
}
