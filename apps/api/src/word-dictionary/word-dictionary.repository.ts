import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { WordDictionaryEntity } from './word-dictionary.entity';

@Injectable()
export class WordDictionaryRepository {
  constructor(
    @InjectRepository(WordDictionaryEntity)
    private readonly repo: Repository<WordDictionaryEntity>,
  ) {}

  create(partial: Partial<WordDictionaryEntity>): WordDictionaryEntity {
    return this.repo.create(partial);
  }

  async save(entity: WordDictionaryEntity): Promise<WordDictionaryEntity> {
    return this.repo.save(entity);
  }

  async findByKey(
    lemmaKey: string,
    targetLang: string,
    nativeLang: string,
  ): Promise<WordDictionaryEntity | null> {
    return this.repo.findOneBy({ lemmaKey, targetLang, nativeLang });
  }

  async findByKeys(
    lemmaKeys: string[],
    targetLang: string,
    nativeLang: string,
  ): Promise<Map<string, WordDictionaryEntity>> {
    if (!lemmaKeys.length) return new Map();
    const rows = await this.repo.find({
      where: { lemmaKey: In(lemmaKeys), targetLang, nativeLang },
    });
    return new Map(rows.map(r => [r.lemmaKey, r]));
  }

  async findById(id: string): Promise<WordDictionaryEntity | null> {
    return this.repo.findOneBy({ id });
  }

  async upsertOnConflict(entity: WordDictionaryEntity): Promise<WordDictionaryEntity> {
    // On unique-key conflict the existing row wins — return it.
    try {
      return await this.repo.save(entity);
    } catch (err: any) {
      if (err?.code === '23505') {
        const existing = await this.findByKey(entity.lemmaKey, entity.targetLang, entity.nativeLang);
        if (existing) return existing;
      }
      throw err;
    }
  }

  async countAll(): Promise<number> {
    return this.repo.count();
  }

  async findAllPaginated(offset: number, limit: number): Promise<WordDictionaryEntity[]> {
    return this.repo.find({ skip: offset, take: limit, order: { enrichedAt: 'ASC' } });
  }
}
