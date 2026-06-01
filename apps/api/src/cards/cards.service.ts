import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import type { Card, CardContent, ConfidenceRating, GenderType, MasteryLevel, SRSStateData } from '@lingua-card/shared/domain';
import type { CreateCardDto, UpdateCardDto, CardQueryParams } from '@lingua-card/shared/dto';
import { CardEntity } from './card.entity';

export interface PendingSrsRating {
  cardId: string;
  rating: number;
  reviewedAt: string;
  sessionId: string;
}

@Injectable()
export class CardsService {
  constructor(
    @InjectRepository(CardEntity)
    private readonly repo: Repository<CardEntity>,
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
      userId,
      contextId: dto.contextId,
      content: {
        front: dto.content.front,
        back: dto.content.back,
        article: dto.content.article ?? null,
        gender: (dto.content.gender ?? null) as GenderType,
        examples: (dto.content.examples ?? []).map(e => ({ id: randomUUID(), ...e })),
        notes: dto.content.notes ?? '',
        audioAssetId: dto.content.audioAssetId ?? null,
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
        algorithm: 'sm2',
        intervalDays: 1,
        easeFactor: 2.5,
        repetitions: 0,
        lastRating: null,
        lastReviewedAt: null,
        nextDueAt: now,
        masteryLevel: 0,
        state: 'new',
      } satisfies SRSStateData,
    });
    const saved = await this.repo.save(entity);
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

    for (const rating of ratings) {
      const entity = entityMap.get(rating.cardId);
      if (!entity) continue;
      const existing = entity.srsState ?? this.freshSrsState(entity.id, userId);
      entity.srsState = this.computeSm2(existing, rating.rating as ConfidenceRating);
    }

    await this.repo.save([...entityMap.values()]);
    return { updated: entities.length };
  }

  private computeSm2(state: SRSStateData, rating: ConfidenceRating): SRSStateData {
    let { intervalDays, easeFactor, repetitions } = state;

    if (rating < 3) {
      repetitions = 0;
      intervalDays = rating === 0 ? 1 : 2;
      easeFactor = Math.max(1.3, easeFactor - (rating === 0 ? 0.2 : 0.15));
    } else {
      repetitions += 1;
      if (repetitions === 1) intervalDays = 1;
      else if (repetitions === 2) intervalDays = 6;
      else intervalDays = Math.round(intervalDays * easeFactor);
      const easeAdjust = 0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02);
      easeFactor = Math.max(1.3, easeFactor + easeAdjust);
    }

    const masteryLevel = Math.min(5, Math.floor(repetitions / 2)) as MasteryLevel;
    const nextDueAt = new Date(Date.now() + intervalDays * 86_400_000).toISOString();
    const srsState =
      repetitions === 0 ? 'new'
      : masteryLevel >= 4 ? 'mastered'
      : repetitions <= 2 ? 'learning'
      : 'review';

    return {
      ...state,
      intervalDays,
      easeFactor,
      repetitions,
      lastRating: rating,
      lastReviewedAt: new Date().toISOString(),
      nextDueAt,
      masteryLevel,
      state: srsState as SRSStateData['state'],
    };
  }

  private freshSrsState(cardId: string, userId: string): SRSStateData {
    return {
      id: randomUUID(),
      cardId,
      userId,
      algorithm: 'sm2',
      intervalDays: 1,
      easeFactor: 2.5,
      repetitions: 0,
      lastRating: null,
      lastReviewedAt: null,
      nextDueAt: new Date().toISOString(),
      masteryLevel: 0,
      state: 'new',
    };
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
