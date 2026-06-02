import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { DuplicateCheckResult, DuplicateCheckWord } from '@lingua-card/shared/domain';
import { CardEntity } from './card.entity';

const GERMAN_ARTICLE_PREFIXES = ['der ', 'die ', 'das '];

@Injectable()
export class WordDedupService {
  constructor(
    @InjectRepository(CardEntity)
    private readonly repo: Repository<CardEntity>,
  ) {}

  /**
   * Full-key dedup: article + back.
   * Use for confirmed enriched words (CSV import, /check-duplicates endpoint).
   */
  async findDuplicates(
    userId: string,
    words: DuplicateCheckWord[],
  ): Promise<DuplicateCheckResult[]> {
    const allCards = await this.repo.createQueryBuilder('card')
      .where('card.userId = :userId', { userId })
      .getMany();

    const existingMap = new Map<string, CardEntity>();
    for (const card of allCards) {
      const key = this.normalizeWord(card.content.back, card.content.article);
      if (!existingMap.has(key)) existingMap.set(key, card);
    }

    return words.map(w => {
      const key = this.normalizeWord(w.back, w.article ?? null);
      const found = existingMap.get(key) ?? null;
      return {
        input: w,
        existingCard: found
          ? {
              id: found.id,
              back: found.content.back,
              article: found.content.article,
              collectionId: found.collectionId,
              collectionName: null,
            }
          : null,
      };
    });
  }

  /**
   * Back-only dedup: ignores article, strips article prefixes from back.
   * Use for Phase 1 raw/pending words and image-import enriched words where:
   * - back may contain the article ("der Hund" instead of "Hund")
   * - article from AI extraction is not confirmed
   * A word-only match is sufficient to identify a duplicate.
   */
  async findDuplicatesByBackOnly(
    userId: string,
    words: { back: string }[],
  ): Promise<(CardEntity | null)[]> {
    const allCards = await this.repo.createQueryBuilder('card')
      .where('card.userId = :userId', { userId })
      .getMany();

    // Index vault cards by bare word only (no article)
    const existingMap = new Map<string, CardEntity>();
    for (const card of allCards) {
      const key = this.normalizeBackOnly(card.content.back);
      if (!existingMap.has(key)) existingMap.set(key, card);
    }

    return words.map(w => existingMap.get(this.normalizeBackOnly(w.back)) ?? null);
  }

  private normalizeWord(back: string, article: string | null | undefined): string {
    const word = back.toLowerCase().trim();
    const art = article?.toLowerCase().trim() ?? '';
    return art ? `${art} ${word}` : word;
  }

  /**
   * Normalize a raw extracted word for back-only matching:
   * 1. Lowercase + trim
   * 2. Strip leading article prefix ("der Hund" → "hund")
   * 3. Strip trailing grammar annotation after first comma ("Fahrkarte, -n" → "fahrkarte")
   * 4. Strip parenthetical notes ("Gepäck (Sg.)" → "gepäck")
   */
  private normalizeBackOnly(back: string): string {
    let w = back.toLowerCase().trim();
    for (const prefix of GERMAN_ARTICLE_PREFIXES) {
      if (w.startsWith(prefix)) {
        w = w.slice(prefix.length).trim();
        break;
      }
    }
    w = w.replace(/\s*\(.*?\)\s*$/, '').trim(); // parenthetical at end
    w = w.replace(/,.*$/, '').trim();            // everything after first comma
    return w;
  }
}
