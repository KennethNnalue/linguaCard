import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { WordAudioEntity } from './word-audio.entity';

@Injectable()
export class WordAudioRepository {
  constructor(
    @InjectRepository(WordAudioEntity)
    private readonly repo: Repository<WordAudioEntity>,
  ) {}

  create(partial: Partial<WordAudioEntity>): WordAudioEntity {
    return this.repo.create(partial);
  }

  async save(entity: WordAudioEntity): Promise<WordAudioEntity> {
    return this.repo.save(entity);
  }

  async findByNormalizedText(
    normalizedText: string,
    language: string,
  ): Promise<WordAudioEntity | null> {
    return this.repo.findOneBy({ normalizedText, language });
  }

  async findByNormalizedTexts(
    normalizedTexts: string[],
    language: string,
  ): Promise<WordAudioEntity[]> {
    if (!normalizedTexts.length) return [];
    return this.repo.findBy({ normalizedText: In(normalizedTexts), language });
  }

  async findById(id: string): Promise<WordAudioEntity | null> {
    return this.repo.findOneBy({ id });
  }
}
