import { inject, Injectable, signal } from '@angular/core';
import type { StoryKeyword, WordDictionaryEntry } from '@lingua-card/shared/domain';
import { firstValueFrom } from 'rxjs';
import type { TappedWord, WordToken } from '../models/reader.model';
import { StoryTokenizerService } from './story-tokenizer.service';
import { DictionaryApiService } from '../../vault/services/dictionary-api.service';

/**
 * Shared tapped-word state machine for both story readers.
 *
 * Owns which word (if any) is currently selected and whether its conjugation
 * panel is expanded. The two readers render visually distinct sheets but drive
 * them with this identical logic. Resolving the tapped word into a `WordDetail`
 * and vault actions stay in {@link StoryWordSheetService} — this service is purely
 * the selection state.
 *
 * Not `providedIn: 'root'`: each reader provides its own instance so selection
 * state is scoped to the page.
 */
@Injectable()
export class StoryReaderInteractionService {
  private readonly tokenizer = inject(StoryTokenizerService);
  private readonly dictionary = inject(DictionaryApiService);

  readonly tappedWord = signal<TappedWord | null>(null);
  readonly showConjugations = signal(false);

  /** Dictionary lookup state for a tapped non-vocab word (DB-only, no AI). */
  readonly dictLoading = signal(false);
  readonly dictEntry = signal<WordDictionaryEntry | null>(null);
  /** Cache by `base|article` so re-tapping the same word never refetches. */
  private readonly dictCache = new Map<string, WordDictionaryEntry | null>();
  /** Guards against a stale lookup resolving after a newer tap. */
  private lookupSeq = 0;

  /**
   * Toggle selection for a tapped token. Tapping the same word again dismisses the
   * sheet. Any word is selectable; non-vocab words trigger a pure DB dictionary
   * lookup (no AI) to surface a translation when we already have one.
   */
  tap(sentenceIdx: number, token: WordToken): void {
    const current = this.tappedWord();
    if (current?.sentenceIdx === sentenceIdx && current.wordIdx === token.wordIdx) {
      this.dismiss();
      return;
    }
    this.showConjugations.set(false);
    const base = this.tokenizer.stripPunctuation(token.text);
    this.tappedWord.set({
      sentenceIdx,
      wordIdx: token.wordIdx,
      word: token.text,
      base,
      isVocab: token.isVocab,
    });

    // In-story vocab/keywords already carry their translation; others fall back to
    // a dictionary DB read so the sheet can show a translation when available.
    if (token.isVocab) {
      this.clearDictState();
    } else {
      void this.resolveTranslation(base);
    }
  }

  /** DB-only dictionary lookup for a plain tapped word. Cache-first; never calls AI. */
  private async resolveTranslation(base: string): Promise<void> {
    if (!base) {
      this.clearDictState();
      return;
    }
    const key = base.toLowerCase();
    if (this.dictCache.has(key)) {
      this.dictEntry.set(this.dictCache.get(key) ?? null);
      this.dictLoading.set(false);
      return;
    }

    const seq = ++this.lookupSeq;
    this.dictEntry.set(null);
    this.dictLoading.set(true);
    try {
      const { entry } = await firstValueFrom(this.dictionary.lookup(base));
      this.dictCache.set(key, entry);
      if (seq === this.lookupSeq) this.dictEntry.set(entry);
    } catch {
      if (seq === this.lookupSeq) this.dictEntry.set(null);
    } finally {
      if (seq === this.lookupSeq) this.dictLoading.set(false);
    }
  }

  private clearDictState(): void {
    this.lookupSeq++;
    this.dictLoading.set(false);
    this.dictEntry.set(null);
  }

  /**
   * Open the sheet from a Keywords-tab row. Synthesises a tapped-word entry keyed
   * by the keyword's base so the reader's `tappedWordDetail` resolves it via the
   * keyword lookup (article, wordType, conjugations all populated).
   */
  openKeyword(keyword: StoryKeyword): void {
    this.showConjugations.set(false);
    this.clearDictState();
    this.tappedWord.set({
      sentenceIdx: -1,
      wordIdx: -1,
      word: keyword.german,
      base: keyword.germanBase,
      isVocab: true,
    });
  }

  dismiss(): void {
    this.tappedWord.set(null);
    this.showConjugations.set(false);
    this.clearDictState();
  }

  toggleConjugations(): void {
    this.showConjugations.update(v => !v);
  }

  isWordActive(sentenceIdx: number, wordIdx: number): boolean {
    const t = this.tappedWord();
    return t?.sentenceIdx === sentenceIdx && t.wordIdx === wordIdx;
  }
}
