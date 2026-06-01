import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { DuplicateCheckResult, DuplicateCheckWord } from '@lingua-card/shared/domain';
import { CardEntity } from './card.entity';

@Injectable()
export class WordDedupService {
  constructor(
    @InjectRepository(CardEntity)
    private readonly repo: Repository<CardEntity>,
  ) {}

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
              collectionName: null, // populated by controller if needed
            }
          : null,
      };
    });
  }

  private normalizeWord(back: string, article: string | null | undefined): string {
    const word = back.toLowerCase().trim();
    const art = article?.toLowerCase().trim() ?? '';
    return art ? `${art} ${word}` : word;
  }
}
