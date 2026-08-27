import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { LearningContextEntity } from '../entities/learning-context.entity';
import { stableResourceId } from '../../vocabulary/domain/stable-resource-id';
import type {
  CollectionSummaryRow,
  LearningItemCursor,
  LearningItemReadRow,
} from '../models/learning-item-read.models';

export interface FindLearningItemsOptions {
  userId: string;
  learningContextId: string;
  collectionId?: string;
  query?: string;
  cursor?: LearningItemCursor;
  limit: number;
}

export const LEARNING_ITEM_READ_REPOSITORY = Symbol('LEARNING_ITEM_READ_REPOSITORY');

export interface LearningItemReadPort {
  findLearningContext(userId: string, learningContextId: string): Promise<LearningContextEntity | null>;
  findActiveLearningContext(userId: string): Promise<LearningContextEntity | null>;
  ensureActiveLearningContext(userId: string): Promise<LearningContextEntity>;
  findLearningItems(options: FindLearningItemsOptions): Promise<LearningItemReadRow[]>;
  loadLearningItemStats(userId: string, learningContextId: string): Promise<LearningItemStats>;
  findCollectionSummaries(userId: string, learningContextId: string): Promise<CollectionSummaryRow[]>;
  countPublishedPlatformCollections(sourceLanguage: string, targetLanguage: string): Promise<number>;
}

export interface LearningItemStats {
  itemCount: number;
  dueCount: number;
  masteredCount: number;
}

@Injectable()
export class LearningItemReadRepository implements LearningItemReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  findLearningContext(userId: string, learningContextId: string): Promise<LearningContextEntity | null> {
    return this.dataSource.getRepository(LearningContextEntity).findOneBy({
      id: learningContextId,
      userId,
    });
  }

  findActiveLearningContext(userId: string): Promise<LearningContextEntity | null> {
    return this.dataSource.getRepository(LearningContextEntity).findOneBy({ userId, isActive: true });
  }

  async ensureActiveLearningContext(userId: string): Promise<LearningContextEntity> {
    const active = await this.findActiveLearningContext(userId);
    if (active) return active;

    return this.dataSource.transaction(async manager => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`learning-context:${userId}`]);
      const repository = manager.getRepository(LearningContextEntity);
      const concurrentActive = await repository.findOneBy({ userId, isActive: true });
      if (concurrentActive) return concurrentActive;

      let context = await repository.findOneBy({
        userId,
        sourceLanguage: 'en',
        targetLanguage: 'de',
      });
      if (!context) {
        context = repository.create({
          id: stableResourceId('learning-context', userId, 'en', 'de'),
          userId,
          sourceLanguage: 'en',
          targetLanguage: 'de',
          isActive: true,
        });
      } else {
        context.isActive = true;
      }
      return repository.save(context);
    });
  }

  findLearningItems(options: FindLearningItemsOptions): Promise<LearningItemReadRow[]> {
    const search = options.query?.trim() || null;
    const cursorCreatedAt = options.cursor?.createdAt ?? null;
    const cursorId = options.cursor?.id ?? null;

    return this.dataSource.query<LearningItemReadRow[]>(
      `SELECT
         item.id,
         item."learningContextId",
         context."sourceLanguage",
         context."targetLanguage",
         lexeme.id AS "lexemeId",
         lexeme."displayText" AS "lexemeText",
         lexeme."partOfSpeech",
         lexeme.grammar,
         lexeme.phonetic,
         context."sourceLanguage" AS "localizationLanguage",
         COALESCE(localization.translation, '') AS translation,
         localization.definition,
         COALESCE(examples.items, '[]'::jsonb) AS examples,
         item."personalNote",
         scheduling.state AS "reviewState",
         COALESCE(memberships.ids, ARRAY[]::varchar[]) AS "collectionIds",
         item."createdAt",
         item."updatedAt"
       FROM learning_items item
       JOIN learning_contexts context ON context.id = item."learningContextId"
       JOIN lexemes lexeme ON lexeme.id = item."lexemeId"
       LEFT JOIN lexeme_localizations localization
         ON localization."lexemeId" = lexeme.id
        AND localization.language = context."sourceLanguage"
        AND localization."isActive" = true
       LEFT JOIN review_scheduling scheduling ON scheduling."cardId" = COALESCE(item."legacyCardId", item.id)
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(
           jsonb_build_object(
             'id', sentence.id,
             'targetText', sentence."displayText",
             'sourceText', example_localization.text
           ) ORDER BY sentence.position, sentence.id
         ) AS items
         FROM example_sentences sentence
         LEFT JOIN example_localizations example_localization
           ON example_localization."exampleSentenceId" = sentence.id
          AND example_localization.language = context."sourceLanguage"
          AND example_localization."isActive" = true
         WHERE sentence."lexemeId" = lexeme.id
           AND sentence.language = context."targetLanguage"
       ) examples ON true
       LEFT JOIN LATERAL (
         SELECT array_agg(membership."collectionId" ORDER BY membership."collectionId") AS ids
         FROM user_collection_items membership
         JOIN collections collection
           ON collection.id = membership."collectionId" AND collection."userId" = item."userId"
         WHERE membership."learningItemId" = item.id
       ) memberships ON true
       WHERE item."userId" = $1
         AND item."learningContextId" = $2
         AND (
           $3::varchar IS NULL
           OR EXISTS (
             SELECT 1
             FROM user_collection_items requested_membership
             JOIN collections requested_collection
               ON requested_collection.id = requested_membership."collectionId"
              AND requested_collection."userId" = item."userId"
             WHERE requested_membership."learningItemId" = item.id
               AND requested_membership."collectionId" = $3
           )
         )
         AND (
           $4::varchar IS NULL
           OR lexeme."displayText" ILIKE '%' || $4 || '%'
           OR localization.translation ILIKE '%' || $4 || '%'
         )
         AND (
           $5::timestamptz IS NULL
           OR (date_trunc('milliseconds', item."createdAt"), item.id)
             < ($5::timestamptz, $6::varchar)
         )
       ORDER BY date_trunc('milliseconds', item."createdAt") DESC, item.id DESC
       LIMIT $7`,
      [
        options.userId,
        options.learningContextId,
        options.collectionId ?? null,
        search,
        cursorCreatedAt,
        cursorId,
        options.limit,
      ],
    );
  }

  async loadLearningItemStats(userId: string, learningContextId: string): Promise<LearningItemStats> {
    const rows = await this.dataSource.query<LearningItemStats[]>(
      `SELECT
         COUNT(item.id)::int AS "itemCount",
         COUNT(*) FILTER (
           WHERE (scheduling.state->>'dueAt')::timestamptz <= now()
             AND COALESCE(scheduling.state->>'masterySource', '') <> 'manual'
         )::int AS "dueCount",
         COUNT(*) FILTER (
           WHERE scheduling.state->>'stage' = 'mastered'
             AND scheduling.state->>'relearning' IS NULL
         )::int AS "masteredCount"
       FROM learning_items item
       LEFT JOIN review_scheduling scheduling ON scheduling."cardId" = COALESCE(item."legacyCardId", item.id)
       WHERE item."userId" = $1 AND item."learningContextId" = $2`,
      [userId, learningContextId],
    );
    return rows[0] ?? { itemCount: 0, dueCount: 0, masteredCount: 0 };
  }

  findCollectionSummaries(userId: string, learningContextId: string): Promise<CollectionSummaryRow[]> {
    return this.dataSource.query<CollectionSummaryRow[]>(
      `SELECT
         collection.id,
         collection."learningContextId",
         collection.name,
         collection.description,
         COALESCE(collection."coverSeed", lower(trim(collection.name))) AS "coverSeed",
         collection."coverImageUrl",
         collection.level,
         collection.topic,
         COUNT(membership."learningItemId")::int AS "itemCount",
         COUNT(*) FILTER (
           WHERE scheduling.state->>'stage' = 'mastered'
             AND scheduling.state->>'relearning' IS NULL
         )::int AS "masteredCount",
         COUNT(*) FILTER (
           WHERE (scheduling.state->>'dueAt')::timestamptz <= now()
             AND COALESCE(scheduling.state->>'masterySource', '') <> 'manual'
         )::int AS "dueCount",
         collection."createdAt",
         collection."updatedAt"
       FROM collections collection
       LEFT JOIN user_collection_items membership ON membership."collectionId" = collection.id
       LEFT JOIN learning_items item ON item.id = membership."learningItemId"
       LEFT JOIN review_scheduling scheduling ON scheduling."cardId" = COALESCE(item."legacyCardId", item.id)
       WHERE collection."userId" = $1 AND collection."learningContextId" = $2
       GROUP BY collection.id
       ORDER BY collection."createdAt" ASC, collection.id ASC`,
      [userId, learningContextId],
    );
  }

  async countPublishedPlatformCollections(sourceLanguage: string, targetLanguage: string): Promise<number> {
    const rows = await this.dataSource.query<Array<{ availableCount: number }>>(
      `SELECT COUNT(*)::int AS "availableCount"
       FROM platform_collections
       WHERE "isPublished" = true
         AND "sourceLanguage" = $1
         AND "targetLanguage" = $2`,
      [sourceLanguage, targetLanguage],
    );
    return rows[0]?.availableCount ?? 0;
  }
}
