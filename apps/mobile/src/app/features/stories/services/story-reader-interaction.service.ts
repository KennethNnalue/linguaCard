import { inject, Injectable, signal } from '@angular/core';
import type { StoryKeyword } from '@lingua-card/shared/domain';
import type { TappedWord, WordToken } from '../models/reader.model';
import { StoryTokenizerService } from './story-tokenizer.service';

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

  readonly tappedWord = signal<TappedWord | null>(null);
  readonly showConjugations = signal(false);

  /**
   * Toggle selection for a tapped token. Tapping the same word again (or a
   * non-vocab word) dismisses the sheet. Vocab-ness is supplied by the caller so
   * either reader's tokenisation source can drive this.
   */
  tap(sentenceIdx: number, token: WordToken): void {
    if (!token.isVocab) {
      this.dismiss();
      return;
    }
    const current = this.tappedWord();
    if (current?.sentenceIdx === sentenceIdx && current.wordIdx === token.wordIdx) {
      this.dismiss();
      return;
    }
    this.showConjugations.set(false);
    this.tappedWord.set({
      sentenceIdx,
      wordIdx: token.wordIdx,
      word: token.text,
      base: this.tokenizer.stripPunctuation(token.text),
      isVocab: token.isVocab,
    });
  }

  /**
   * Open the sheet from a Keywords-tab row. Synthesises a tapped-word entry keyed
   * by the keyword's base so the reader's `tappedWordDetail` resolves it via the
   * keyword lookup (article, wordType, conjugations all populated).
   */
  openKeyword(keyword: StoryKeyword): void {
    this.showConjugations.set(false);
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
  }

  toggleConjugations(): void {
    this.showConjugations.update(v => !v);
  }

  isWordActive(sentenceIdx: number, wordIdx: number): boolean {
    const t = this.tappedWord();
    return t?.sentenceIdx === sentenceIdx && t.wordIdx === wordIdx;
  }
}
