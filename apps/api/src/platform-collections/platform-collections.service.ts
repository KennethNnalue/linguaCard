import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { createNewReviewScheduling } from '../review/review-scheduling.entity';
import type {
  PlatformCollectionListResponse,
  PlatformCollectionSummary,
  PlatformCollectionDetail,
  PlatformCollectionWordView,
  AdoptPlatformCollectionResult,
  CefrLevel,
  Collection,
  StoryDifficulty,
  StoryCategory,
} from '@lingua-card/shared/domain';
import { PlatformCollectionEntity } from '../admin/platform-collection.entity';
import { PlatformCollectionWordEntity } from '../admin/platform-collection-word.entity';
import { WordDictionaryRepository } from '../word-dictionary/word-dictionary.repository';
import { PlatformStoriesService } from '../platform-stories/platform-stories.service';
import { CollectionEntity } from '../collections/collection.entity';
import { CardEntity } from '../cards/card.entity';

@Injectable()
export class PlatformCollectionsService {
  constructor(
    @InjectRepository(PlatformCollectionEntity)
    private readonly collectionRepo: Repository<PlatformCollectionEntity>,
    @InjectRepository(PlatformCollectionWordEntity)
    private readonly wordRepo: Repository<PlatformCollectionWordEntity>,
    @InjectRepository(CollectionEntity)
    private readonly userCollectionRepo: Repository<CollectionEntity>,
    @InjectRepository(CardEntity)
    private readonly cardRepo: Repository<CardEntity>,
    private readonly dictRepo: WordDictionaryRepository,
    private readonly storiesService: PlatformStoriesService,
  ) {}

  async findAll(userId: string): Promise<PlatformCollectionListResponse> {
    const collections = await this.collectionRepo.find({
      where: { isPublished: true },
      order: { createdAt: 'ASC' },
    });

    if (!collections.length) {
      return { collections: [], levelCounts: this.emptyLevelCounts(), suggestedLevel: 'A1' };
    }

    const ids = collections.map(c => c.id);

    // One aggregate: known words per collection for this user
    const knownRows: Array<{ platformCollectionId: string; known: number }> =
      await this.collectionRepo.manager.query(
        `SELECT pcw."platformCollectionId", COUNT(*)::int AS known
         FROM platform_collection_words pcw
         JOIN cards c ON c."dictionaryWordId" = pcw."dictionaryWordId"
           AND c."userId" = $1
         WHERE pcw."platformCollectionId" = ANY($2::text[])
         GROUP BY pcw."platformCollectionId"`,
        [userId, ids],
      );
    const knownMap = new Map(knownRows.map(r => [r.platformCollectionId, r.known]));

    // Adopted collections for this user (by sourcePlatformCollectionId)
    const adoptedRows: Array<{ id: string; sourcePlatformCollectionId: string }> =
      await this.collectionRepo.manager.query(
        `SELECT id, "sourcePlatformCollectionId"
         FROM collections
         WHERE "userId" = $1
           AND "sourcePlatformCollectionId" = ANY($2::text[])`,
        [userId, ids],
      );
    const adoptedMap = new Map(adoptedRows.map(r => [r.sourcePlatformCollectionId, r.id]));

    // suggestedLevel = mode of cefrLevel over the user's dictionary-linked cards
    const suggestedLevel = await this.inferUserLevel(userId);

    const levelCounts = this.emptyLevelCounts();
    const summaries: PlatformCollectionSummary[] = collections.map(c => {
      const level = c.level as CefrLevel;
      levelCounts[level] = (levelCounts[level] ?? 0) + 1;
      return {
        id: c.id,
        title: c.title,
        emoji: c.emoji,
        level,
        topic: c.topic,
        wordCount: c.wordCount,
        knownCount: knownMap.get(c.id) ?? 0,
        adoptionStatus: adoptedMap.has(c.id) ? 'adopted' : 'not-adopted',
        adoptedCollectionId: adoptedMap.get(c.id) ?? null,
      };
    });

    return { collections: summaries, levelCounts, suggestedLevel };
  }

  async findOne(userId: string, id: string): Promise<PlatformCollectionDetail> {
    const collection = await this.collectionRepo.findOneBy({ id, isPublished: true });
    if (!collection) throw new NotFoundException(`Platform collection ${id} not found`);

    // Fetch word rows ordered by position
    const wordRows = await this.wordRepo.find({
      where: { platformCollectionId: id },
      order: { position: 'ASC' },
    });
    const dictIds = wordRows.map(w => w.dictionaryWordId);

    // Bulk fetch dictionary entries
    const dictEntries = await this.dictRepo.findByIds(dictIds);
    const dictMap = new Map(dictEntries.map(e => [e.id, e]));

    // Known set for this user
    const knownRows: Array<{ dictionaryWordId: string }> =
      await this.collectionRepo.manager.query(
        `SELECT "dictionaryWordId" FROM cards
         WHERE "userId" = $1 AND "dictionaryWordId" = ANY($2::text[])`,
        [userId, dictIds],
      );
    const knownSet = new Set(knownRows.map(r => r.dictionaryWordId));

    const knownCount = knownSet.size;

    // Adopted?
    const adoptedRows: Array<{ id: string }> =
      await this.collectionRepo.manager.query(
        `SELECT id FROM collections WHERE "userId" = $1 AND "sourcePlatformCollectionId" = $2 LIMIT 1`,
        [userId, id],
      );
    const adoptedCollectionId = adoptedRows[0]?.id ?? null;

    const words: PlatformCollectionWordView[] = wordRows.map(w => {
      const e = dictMap.get(w.dictionaryWordId);
      return {
        dictionaryWordId: w.dictionaryWordId,
        displayText: e?.displayText ?? '',
        article: e?.article ?? null,
        translation: e?.translation ?? '',
        wordType: e?.wordType ?? 'other',
        cefrLevel: (e?.cefrLevel as CefrLevel | null) ?? null,
        exampleTarget: e?.examples?.[0]?.target ?? null,
        exampleNative: e?.examples?.[0]?.native ?? null,
        knownToUser: knownSet.has(w.dictionaryWordId),
      };
    });

    // Related stories via storyCategory
    const relatedStories =
      collection.storyCategory
        ? (await this.storiesService.findAll(userId, {
            level: collection.level as StoryDifficulty,
            category: collection.storyCategory as StoryCategory,
            limit: 6,
          })).stories
        : [];

    return {
      id: collection.id,
      title: collection.title,
      emoji: collection.emoji,
      level: collection.level as CefrLevel,
      topic: collection.topic,
      wordCount: collection.wordCount,
      knownCount,
      adoptionStatus: adoptedCollectionId ? 'adopted' : 'not-adopted',
      adoptedCollectionId,
      words,
      relatedStories,
    };
  }

  async adopt(userId: string, platformCollectionId: string): Promise<AdoptPlatformCollectionResult> {
    const platform = await this.collectionRepo.findOneBy({ id: platformCollectionId, isPublished: true });
    if (!platform) throw new NotFoundException(`Platform collection ${platformCollectionId} not found`);

    // Idempotent: if already adopted, return existing with live counts
    const existing = await this.userCollectionRepo.findOneBy({
      userId,
      sourcePlatformCollectionId: platformCollectionId,
    });
    if (existing) {
      const model = await this.toCollectionModelLive(existing, userId);
      return { collection: model, addedCount: 0, skippedCount: platform.wordCount };
    }

    // Fetch platform words + dictionary entries
    const wordRows = await this.wordRepo.find({
      where: { platformCollectionId },
      order: { position: 'ASC' },
    });
    const dictIds = wordRows.map(w => w.dictionaryWordId);
    const dictEntries = await this.dictRepo.findByIds(dictIds);
    const dictMap = new Map(dictEntries.map(e => [e.id, e]));

    // Dedup primary: dictionaryWordId exact match
    const linkedIds: Array<{ dictionaryWordId: string }> = await this.cardRepo.manager.query(
      `SELECT "dictionaryWordId" FROM cards
       WHERE "userId" = $1 AND "dictionaryWordId" = ANY($2::text[])`,
      [userId, dictIds],
    );
    const linkedSet = new Set(linkedIds.map(r => r.dictionaryWordId));

    // Dedup fallback: normalise lemmaKey against unlinked card backs
    // Use the same normalisation on both sides: lower + trim only; no accent stripping
    const lemmaKeySet = new Set(dictEntries.map(e => e.lemmaKey.toLowerCase().trim()));
    const legacyRows: Array<{ lemma: string }> = lemmaKeySet.size
      ? await this.cardRepo.manager.query(
          `SELECT lower(trim(content->>'back')) AS lemma
           FROM cards
           WHERE "userId" = $1 AND "dictionaryWordId" IS NULL`,
          [userId],
        )
      : [];
    const legacySet = new Set(legacyRows.map(r => r.lemma));

    // Build new cards + track skips inside a single transaction
    const colId = randomUUID();
    let addedCount = 0;
    let skippedCount = 0;

    const savedCol = await this.userCollectionRepo.manager.transaction(async manager => {
      const userCol = manager.create(CollectionEntity, {
        id: colId,
        userId,
        name: platform.title,
        description: '',
        emoji: platform.emoji ?? '📚',
        colour: '#2D5A4E',
        contextId: 'german-vocab',
        cardCount: 0,
        masteredCount: 0,
        dueCount: 0,
        isDefault: false,
        importStatus: 'complete',
        pendingWords: [],
        sourcePlatformCollectionId: platformCollectionId,
        level: platform.level,
        topic: platform.topic,
      });
      await manager.save(userCol);

      const newCards: CardEntity[] = [];
      for (const wr of wordRows) {
        const e = dictMap.get(wr.dictionaryWordId);
        if (!e) { skippedCount++; continue; }

        const lemmaLower = e.lemmaKey.toLowerCase().trim();
        if (linkedSet.has(wr.dictionaryWordId) || legacySet.has(lemmaLower)) {
          skippedCount++;
          continue;
        }

        const cardId = randomUUID();
        newCards.push(
          manager.create(CardEntity, {
            id: cardId,
            userId,
            collectionId: colId,
            deckId: 'deck-001',
            contextId: 'german-vocab',
            dictionaryWordId: e.id,
            content: {
              front: e.translation,
              back: e.displayText,
              article: e.article,
              gender: e.gender,
              plural: e.plurals?.[0] ? `die ${e.plurals[0]}` : null,
              examples: e.examples.map(ex => ({ id: randomUUID(), target: ex.target, native: ex.native })),
              synonyms: e.synonyms ?? [],
              notes: '',
              imageUrl: null,
              phonetic: e.phonetic ?? null,
            },
            categoryIds: [],
            tags: [`platform:${platformCollectionId}`],
            version: 1,
            scheduling: createNewReviewScheduling(cardId),
          }),
        );
      }

      if (newCards.length) {
        await manager.save(newCards);
      }
      addedCount = newCards.length;

      // Update cardCount accurately before returning
      userCol.cardCount = addedCount;
      return manager.save(userCol);
    });

    const model = await this.toCollectionModelLive(savedCol, userId);
    return { collection: model, addedCount, skippedCount };
  }

  private async toCollectionModelLive(e: CollectionEntity, userId: string): Promise<Collection> {
    const now = new Date().toISOString();
    const rows: Array<{ cardCount: number; masteredCount: number; dueCount: number }> =
      await this.collectionRepo.manager.query(
        `SELECT
           COUNT(*)::int AS "cardCount",
           SUM(CASE WHEN scheduling."state"->>'stage' = 'mastered' THEN 1 ELSE 0 END)::int AS "masteredCount",
           SUM(CASE WHEN scheduling."state"->>'dueAt' <= $1
                      AND COALESCE(scheduling."state"->>'masterySource', '') <> 'manual'
                    THEN 1 ELSE 0 END)::int AS "dueCount"
         FROM cards card
         INNER JOIN review_scheduling scheduling ON scheduling."cardId" = card."id"
         WHERE card."collectionId" = $2 AND card."userId" = $3`,
        [now, e.id, userId],
      );
    const counts = rows[0] ?? { cardCount: 0, masteredCount: 0, dueCount: 0 };
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
      importStatus: (e.importStatus as any) ?? 'complete',
      pendingWords: e.pendingWords ?? [],
      sourcePlatformCollectionId: e.sourcePlatformCollectionId ?? null,
      level: e.level ?? null,
      topic: e.topic ?? null,
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
      updatedAt: e.updatedAt instanceof Date ? e.updatedAt.toISOString() : String(e.updatedAt),
    };
  }

  private async inferUserLevel(userId: string): Promise<CefrLevel> {
    const rows: Array<{ cefrLevel: string; cnt: number }> =
      await this.collectionRepo.manager.query(
        `SELECT wd."cefrLevel", COUNT(*)::int AS cnt
         FROM cards c
         JOIN word_dictionary wd ON wd.id = c."dictionaryWordId"
         WHERE c."userId" = $1 AND wd."cefrLevel" IS NOT NULL
         GROUP BY wd."cefrLevel"
         ORDER BY cnt DESC
         LIMIT 1`,
        [userId],
      );
    const level = rows[0]?.cefrLevel as CefrLevel | undefined;
    return level ?? 'A1';
  }

  private emptyLevelCounts(): Record<CefrLevel, number> {
    return { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 };
  }
}
