import { Injectable } from '@nestjs/common';
import type { WordTimestamp, StoryVocabWord } from '@lingua-card/shared/domain';

@Injectable()
export class StoryVocabMapper {
  markVocabWords(timestamps: WordTimestamp[], vocabWords: StoryVocabWord[]): WordTimestamp[] {
    const lookup = new Map<string, string>(); // normalised word → cardId
    vocabWords.forEach(v => {
      lookup.set(this.normalise(v.germanBase), v.cardId);
      lookup.set(this.normalise(v.german.replace(/^(der|die|das)\s+/i, '')), v.cardId);
    });

    return timestamps.map(ts => {
      const norm = this.normalise(ts.word);
      const cardId = lookup.get(norm);
      return cardId ? { ...ts, isVocab: true, cardId } : ts;
    });
  }

  private normalise(word: string): string {
    return word.toLowerCase().replace(/[,.!?;:"""''()]/g, '').trim();
  }
}
