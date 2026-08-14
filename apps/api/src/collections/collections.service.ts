import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import type { Collection, CollectionImportStatus, RawExtractedWord } from '@lingua-card/shared/domain';
import { CreateCollectionDto, UpdateCollectionDto } from '@lingua-card/shared/dto';
import { CollectionEntity } from './collection.entity';
import { CardEntity } from '../cards/card.entity';
import { ShareSyncService } from '../shares/share-sync.service';

interface LiveCounts { cardCount: number; masteredCount: number; dueCount: number; }

@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);

  constructor(
    @InjectRepository(CollectionEntity)
    private readonly repo: Repository<CollectionEntity>,
    @InjectRepository(CardEntity)
    private readonly cardRepo: Repository<CardEntity>,
    @Optional() private readonly syncService?: ShareSyncService,
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
           card."collectionId",
           COUNT(*)::int AS "cardCount",
           SUM(CASE WHEN scheduling."state"->>'stage' = 'mastered' THEN 1 ELSE 0 END)::int AS "masteredCount",
           SUM(CASE WHEN scheduling."state"->>'dueAt' <= $1
                      AND COALESCE(scheduling."state"->>'masterySource', '') <> 'manual'
                    THEN 1 ELSE 0 END)::int AS "dueCount"
         FROM cards card
         INNER JOIN review_scheduling scheduling ON scheduling."cardId" = card."id"
         WHERE card."collectionId" IS NOT NULL AND card."userId" = $2
         GROUP BY card."collectionId"`,
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
    const { pendingWords, ...rest } = dto;
    Object.assign(entity, rest);
    if (pendingWords !== undefined) {
      entity.pendingWords = [...(entity.pendingWords ?? []), ...(pendingWords as RawExtractedWord[])];
    }
    const saved = await this.repo.save(entity);
    const countsMap = await this.buildCountsMap(userId);
    return this.toModel(saved, countsMap.get(id) ?? { cardCount: 0, masteredCount: 0, dueCount: 0 });
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.repo.delete({ id, userId });
    if (!result.affected) throw new NotFoundException(`Collection ${id} not found`);

    void this.syncService?.deactivateBySource(id).catch(err =>
      this.logger.warn(`Sync deactivateBySource failed: ${err.message}`));
    void this.syncService?.deactivateByTarget(id).catch(err =>
      this.logger.warn(`Sync deactivateByTarget failed: ${err.message}`));
  }

  /** Assign an existing card to a collection without creating a new card. */
  async addExistingCard(userId: string, collectionId: string, cardId: string): Promise<void> {
    const [collection, card] = await Promise.all([
      this.repo.findOneBy({ id: collectionId, userId }),
      this.cardRepo.findOneBy({ id: cardId, userId }),
    ]);
    if (!collection) throw new NotFoundException(`Collection ${collectionId} not found`);
    if (!card) throw new NotFoundException(`Card ${cardId} not found`);
    card.collectionId = collectionId;
    await this.cardRepo.save(card);
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
      importStatus: (e.importStatus as CollectionImportStatus) ?? 'complete',
      pendingWords: e.pendingWords ?? [],
      sourceImageDescription: e.sourceImageDescription ?? undefined,
      sourcePlatformCollectionId: e.sourcePlatformCollectionId ?? null,
      level: e.level ?? null,
      topic: e.topic ?? null,
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
      updatedAt: e.updatedAt instanceof Date ? e.updatedAt.toISOString() : e.updatedAt,
    };
  }
}
