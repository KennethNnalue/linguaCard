import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import type { Story } from '@lingua-card/shared/domain';
import type { TappedWord, WordToken } from '../../models/reader.model';
import { StoryTokenizerService } from '../../services/story-tokenizer.service';

/** A word tapped within the rendered story text. */
export interface StoryWordTap {
  sentenceIdx: number;
  token: WordToken;
}

/**
 * Renders the story's sentences as tappable, karaoke-highlightable tokens.
 *
 * Tokenisation and the per-sentence timestamp ranges are derived once (computed)
 * from the story — never per token, per change-detection cycle — so karaoke
 * highlighting stays O(1) per token during playback.
 */
@Component({
  selector: 'lc-story-text',
  templateUrl: './story-text.component.html',
  styleUrls: ['./story-text.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoryTextComponent {
  private readonly tokenizer = inject(StoryTokenizerService);

  readonly story = input.required<Story>();
  readonly activeWordIdx = input(-1);
  readonly showTranslation = input(false);
  readonly tappedWord = input<TappedWord | null>(null);

  readonly wordTap = output<StoryWordTap>();

  readonly sentenceTokens = computed<WordToken[][]>(() => {
    const s = this.story();
    const vocabBases = new Set([
      ...s.vocabWords.map(v => v.germanBase.toLowerCase()),
      ...(s.keywords ?? []).map(k => k.germanBase.toLowerCase()),
    ]);
    return s.sentences.map(sent => this.tokenizer.tokenise(sent, vocabBases));
  });

  private readonly sentenceRanges = computed(() =>
    this.tokenizer.computeSentenceWordRanges(
      this.story().sentences,
      this.story().wordTimestamps.length,
    ),
  );

  isKaraoke(sentenceIdx: number, wordIdx: number): boolean {
    const active = this.activeWordIdx();
    return active >= 0 && this.flatIndex(sentenceIdx, wordIdx) === active;
  }

  isRead(sentenceIdx: number, wordIdx: number): boolean {
    const active = this.activeWordIdx();
    if (active < 0) return false;
    return this.flatIndex(sentenceIdx, wordIdx) < active;
  }

  isTapped(sentenceIdx: number, wordIdx: number): boolean {
    const t = this.tappedWord();
    return t?.sentenceIdx === sentenceIdx && t.wordIdx === wordIdx;
  }

  onWordTap(sentenceIdx: number, token: WordToken): void {
    this.wordTap.emit({ sentenceIdx, token });
  }

  private flatIndex(sentenceIdx: number, wordIdx: number): number {
    const range = this.sentenceRanges()[sentenceIdx];
    return range ? range.start + wordIdx : -1;
  }
}
