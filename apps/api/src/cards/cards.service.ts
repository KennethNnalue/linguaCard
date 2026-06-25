import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import type { Card, CardContent, ConfidenceRating, GenderType, SRSStateData } from '@lingua-card/shared/domain';
import type { CreateCardDto, UpdateCardDto, CardQueryParams } from '@lingua-card/shared/dto';
import { computeFSRS, freshFsrsState } from '@lingua-card/shared/utils';
import { CardEntity } from './card.entity';
import { WordAudioService } from '../word-audio/word-audio.service';
import { SubscriptionService } from '../subscriptions/subscription.service';

export interface PendingSrsRating {
  cardId: string;
  rating: number;
  reviewedAt: string;
  sessionId: string;
}

@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(
    @InjectRepository(CardEntity)
    private readonly repo: Repository<CardEntity>,
    @Optional() private readonly wordAudioService?: WordAudioService,
    @Optional() private readonly subscriptions?: SubscriptionService,
  ) {}

  async findAll(userId: string, query: CardQueryParams): Promise<Card[]> {
    const qb = this.repo.createQueryBuilder('card')
      .where('card.userId = :userId', { userId });
    if (query.collectionId) qb.andWhere('card.collectionId = :collectionId', { collectionId: query.collectionId });
    if (query.categoryId)   qb.andWhere(':categoryId = ANY(card.categoryIds)', { categoryId: query.categoryId });
    if (query.state)        qb.andWhere("card.srsState->>'state' = :state", { state: query.state });
    return (await qb.getMany()).map(this.toModel);
  }

  async findOne(userId: string, id: string): Promise<Card> {
    const entity = await this.repo.findOneBy({ id, userId });
    if (!entity) throw new NotFoundException(`Card ${id} not found`);
    return this.toModel(entity);
  }

  async create(userId: string, dto: CreateCardDto): Promise<Card> {
    const now = new Date().toISOString();
    const entity = this.repo.create({
      id: randomUUID(),
      deckId: dto.deckId,
      collectionId: dto.collectionId ?? null,
      dictionaryWordId: dto.content.dictionaryWordId ?? null,
      userId,
      contextId: dto.contextId,
      content: {
        front: dto.content.front,
        back: dto.content.back,
        article: dto.content.article ?? null,
        gender: (dto.content.gender ?? null) as GenderType,
        plural: dto.content.plural ?? null,
        examples: (dto.content.examples ?? []).map(e => ({ id: randomUUID(), ...e })),
        synonyms: (dto.content.synonyms ?? []).map(s => ({
          word: s.word,
          article: s.article ?? null,
          translation: s.translation,
          example: s.example ?? '',
          exampleNative: s.exampleNative ?? '',
        })),
        notes: dto.content.notes ?? '',
        imageUrl: dto.content.imageUrl ?? null,
        phonetic: dto.content.phonetic ?? null,
      } satisfies CardContent,
      categoryIds: dto.categoryIds ?? [],
      tags: dto.tags ?? [],
      version: 1,
      srsState: {
        id: randomUUID(),
        cardId: '',
        userId,
        algorithm: 'fsrs',
        intervalDays: 1,
        easeFactor: 2.5,
        repetitions: 0,
        lastRating: null,
        lastReviewedAt: null,
        nextDueAt: now,
        masteryLevel: 0,
        state: 'new',
        stability: null,
        difficulty: null,
        retrievability: null,
      } satisfies SRSStateData,
    });
    const saved = await this.repo.save(entity);

    // Fire-and-forget: pre-generate audio for the new word so it's ready before
    // the user taps play — but ONLY for Pro users. Free users' custom-card audio
    // is lazy (cache-first at play, Web Speech otherwise). If the subscription
    // service isn't wired (e.g. tests), skip eager generation to stay cost-safe.
    if (this.wordAudioService) {
      const text = (dto.content.article ? `${dto.content.article} ` : '') + dto.content.back;
      void (async () => {
        if (!this.subscriptions || !(await this.subscriptions.isProUser(userId))) return;
        await this.wordAudioService!.resolve(text, 'de-DE');
      })().catch(err => {
        this.logger.warn(`Pre-generation failed for "${text}":`, err);
      });
    }

    return this.toModel(saved);
  }

  async update(userId: string, id: string, dto: UpdateCardDto): Promise<Card> {
    const entity = await this.repo.findOneBy({ id, userId });
    if (!entity) throw new NotFoundException(`Card ${id} not found`);
    if (dto.content)      entity.content    = { ...entity.content, ...dto.content } as CardContent;
    if (dto.categoryIds)  entity.categoryIds = dto.categoryIds;
    if (dto.tags)         entity.tags        = dto.tags;
    if (dto.collectionId !== undefined) entity.collectionId = dto.collectionId ?? null;
    if (dto.srsState !== undefined) entity.srsState = dto.srsState as unknown as SRSStateData;
    const saved = await this.repo.save(entity);
    return this.toModel(saved);
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.repo.delete({ id, userId });
    if (!result.affected) throw new NotFoundException(`Card ${id} not found`);
  }

  async clearByCollection(userId: string, collectionId: string): Promise<{ deleted: number }> {
    const result = await this.repo.delete({ collectionId, userId });
    return { deleted: result.affected ?? 0 };
  }

  async batchRateSrs(userId: string, ratings: PendingSrsRating[]): Promise<{ updated: number }> {
    const cardIds = ratings.map(r => r.cardId);
    const entities = await this.repo
      .createQueryBuilder('card')
      .where('card.userId = :userId', { userId })
      .andWhere('card.id IN (:...cardIds)', { cardIds })
      .getMany();

    const entityMap = new Map(entities.map(e => [e.id, e]));

    // Apply in chronological order so a batch carrying several reviews of the
    // same card replays them as they happened.
    const ordered = [...ratings].sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));

    for (const rating of ordered) {
      const entity = entityMap.get(rating.cardId);
      if (!entity) continue;
      if (rating.rating < 1 || rating.rating > 4) {
        this.logger.warn(`batchRateSrs: skipping card ${rating.cardId} — invalid rating ${rating.rating}`);
        continue;
      }

      // Last-write-wins by review time: ignore a rating that is not newer than
      // the card's last recorded review. This stops a stale offline rating
      // (flushed late) from clobbering a newer review made on another device,
      // and makes re-flushed ratings idempotent.
      const lastReviewedAt = entity.srsState?.lastReviewedAt;
      if (lastReviewedAt && rating.reviewedAt <= lastReviewedAt) {
        this.logger.debug(
          `batchRateSrs: skipping stale rating for card ${rating.cardId} ` +
          `(reviewedAt ${rating.reviewedAt} <= last ${lastReviewedAt})`,
        );
        continue;
      }

      const existing = entity.srsState ?? freshFsrsState(entity.id, userId, randomUUID);
      entity.srsState = computeFSRS(existing, rating.rating as ConfidenceRating, new Date(rating.reviewedAt));
    }

    await this.repo.save([...entityMap.values()]);
    return { updated: entities.length };
  }

  private toModel(e: CardEntity): Card {
    return {
      id: e.id,
      deckId: e.deckId,
      collectionId: e.collectionId,
      userId: e.userId,
      contextId: e.contextId,
      content: e.content,
      categoryIds: e.categoryIds,
      tags: e.tags,
      version: e.version,
      srsState: e.srsState ?? undefined,
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
      updatedAt: e.updatedAt instanceof Date ? e.updatedAt.toISOString() : e.updatedAt,
    };
  }
}
