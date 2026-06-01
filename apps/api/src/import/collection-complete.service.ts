import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import type {
  CardContent,
  ExampleSentence,
  GenderType,
  ImageExtractedWord,
  RawExtractedWord,
  SRSStateData,
} from '@lingua-card/shared/domain';
import { CollectionEntity } from '../collections/collection.entity';
import { CardEntity } from '../cards/card.entity';
import { WordEnrichService } from './word-enrich.service';

@Injectable()
export class CollectionCompleteService {
  private readonly logger = new Logger(CollectionCompleteService.name);

  constructor(
    private readonly wordEnrich: WordEnrichService,
    @InjectRepository(CollectionEntity)
    private readonly collectionRepo: Repository<CollectionEntity>,
    @InjectRepository(CardEntity)
    private readonly cardRepo: Repository<CardEntity>,
  ) {}

  async resume(userId: string, collectionId: string): Promise<{
    newCards: number;
    pendingWords: RawExtractedWord[];
    isComplete: boolean;
  }> {
    const collection = await this.collectionRepo.findOneBy({ id: collectionId, userId });
    if (!collection) throw new NotFoundException('Collection not found');

    if (collection.importStatus === 'complete') {
      return { newCards: 0, pendingWords: [], isComplete: true };
    }

    const pending = (collection.pendingWords ?? []) as RawExtractedWord[];
    if (pending.length === 0) {
      collection.importStatus = 'complete';
      await this.collectionRepo.save(collection);
      return { newCards: 0, pendingWords: [], isComplete: true };
    }

    const result = await this.wordEnrich.enrichWords({
      rawWords: pending,
      targetLanguage: 'de',
      nativeLanguage: 'en',
      collectionId,
    });

    let newCards = 0;
    for (const word of result.enriched) {
      try {
        await this.createCard(userId, collectionId, word);
        newCards++;
      } catch (err) {
        this.logger.error('Failed to create card during resume', err);
      }
    }

    collection.pendingWords = result.pending;
    collection.importStatus = result.isComplete ? 'complete' : 'incomplete';
    await this.collectionRepo.save(collection);

    return {
      newCards,
      pendingWords: result.pending,
      isComplete: result.isComplete,
    };
  }

  private async createCard(userId: string, collectionId: string, word: ImageExtractedWord): Promise<void> {
    const now = new Date().toISOString();
    const gender: GenderType =
      word.article === 'der' ? 'masculine' :
      word.article === 'die' ? 'feminine' :
      word.article === 'das' ? 'neuter' : null;

    const examples: ExampleSentence[] = word.exampleTarget
      ? [{ id: randomUUID(), target: word.exampleTarget, native: word.exampleNative }]
      : [];

    const content: CardContent = {
      front: word.front,
      back: word.back,
      article: word.article,
      gender,
      examples,
      notes: '',
      audioAssetId: null,
      imageUrl: null,
      phonetic: null,
    };

    const srsState: SRSStateData = {
      id: randomUUID(),
      cardId: '',
      userId,
      algorithm: 'sm2',
      intervalDays: 1,
      easeFactor: 2.5,
      repetitions: 0,
      lastRating: null,
      lastReviewedAt: null,
      nextDueAt: now,
      masteryLevel: 0,
      state: 'new',
    };

    const entity = this.cardRepo.create({
      id: randomUUID(),
      deckId: 'deck-001',
      collectionId,
      userId,
      contextId: 'german-vocab',
      content,
      categoryIds: [],
      tags: [],
      version: 1,
      srsState,
    });

    await this.cardRepo.save(entity);
  }
}
