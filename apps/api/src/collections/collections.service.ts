import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import type { Collection } from '@lingua-card/shared/domain';
import { CreateCollectionDto, UpdateCollectionDto } from '@lingua-card/shared/dto';
import { CollectionEntity } from './collection.entity';
import { CardEntity } from '../cards/card.entity';

interface LiveCounts { cardCount: number; masteredCount: number; dueCount: number; }

@Injectable()
export class CollectionsService {
  constructor(
    @InjectRepository(CollectionEntity)
    private readonly repo: Repository<CollectionEntity>,
    @InjectRepository(CardEntity)
    private readonly cardRepo: Repository<CardEntity>,
  ) {}

  async findAll(userId: string): Promise<Collection[]> {
    const [collections, countsMap] = await Promise.all([
      this.repo.find({ where: { userId }, order: { createdAt: 'ASC' } }),
      this.buildCountsMap(userId),
    ]);
    return collections.map(col =>
      this.toModel(col, countsMap.get(col.id) ?? { cardCount: 0, masteredCount: 0, dueCount: 0 }),
    );
  }

  async findOne(userId: string, id: string): Promise<Collection> {
    const entity = await this.repo.findOneBy({ id, userId });
    if (!entity) throw new NotFoundException(`Collection ${id} not found`);
    const countsMap = await this.buildCountsMap(userId);
    return this.toModel(entity, countsMap.get(id) ?? { cardCount: 0, masteredCount: 0, dueCount: 0 });
  }

  private async buildCountsMap(userId: string): Promise<Map<string, LiveCounts>> {
    const now = new Date().toISOString();
    const rows: Array<{ collectionId: string; cardCount: number; masteredCount: number; dueCount: number }> =
      await this.cardRepo.manager.query(
        `SELECT
           "collectionId",
           COUNT(*)::int AS "cardCount",
           SUM(CASE WHEN "srsState"->>'state' = 'mastered' THEN 1 ELSE 0 END)::int AS "masteredCount",
           SUM(CASE WHEN "srsState" IS NOT NULL AND "srsState"->>'nextDueAt' <= $1 THEN 1 ELSE 0 END)::int AS "dueCount"
         FROM cards
         WHERE "collectionId" IS NOT NULL AND "userId" = $2
         GROUP BY "collectionId"`,
        [now, userId],
      );
    const map = new Map<string, LiveCounts>();
    for (const r of rows) {
      map.set(r.collectionId, { cardCount: r.cardCount, masteredCount: r.masteredCount, dueCount: r.dueCount });
    }
    return map;
  }

  async create(userId: string, dto: CreateCollectionDto): Promise<Collection> {
    const entity = this.repo.create({
      id: randomUUID(),
      userId,
      name: dto.name,
      description: dto.description ?? '',
      emoji: dto.emoji ?? '📚',
      colour: dto.colour ?? '#2D5A4E',
      contextId: dto.contextId,
      cardCount: 0,
      masteredCount: 0,
      dueCount: 0,
      isDefault: false,
    });
    const saved = await this.repo.save(entity);
    return this.toModel(saved, { cardCount: 0, masteredCount: 0, dueCount: 0 });
  }

  async update(userId: string, id: string, dto: UpdateCollectionDto): Promise<Collection> {
    const entity = await this.repo.findOneBy({ id, userId });
    if (!entity) throw new NotFoundException(`Collection ${id} not found`);
    Object.assign(entity, dto);
    const saved = await this.repo.save(entity);
    const countsMap = await this.buildCountsMap(userId);
    return this.toModel(saved, countsMap.get(id) ?? { cardCount: 0, masteredCount: 0, dueCount: 0 });
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.repo.delete({ id, userId });
    if (!result.affected) throw new NotFoundException(`Collection ${id} not found`);
  }

  private toModel(e: CollectionEntity, counts: LiveCounts): Collection {
    return {
      id: e.id,
      userId: e.userId,
      name: e.name,
      description: e.description,
      emoji: e.emoji,
      colour: e.colour,
      contextId: e.contextId,
      cardCount: counts.cardCount,
      masteredCount: counts.masteredCount,
      dueCount: counts.dueCount,
      isDefault: e.isDefault,
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
      updatedAt: e.updatedAt instanceof Date ? e.updatedAt.toISOString() : e.updatedAt,
    };
  }
}
