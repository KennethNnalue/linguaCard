import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ObjectDeletionQueueService } from '../data-deletion/object-deletion-queue.service';
import { storyAudioStorageKey } from '../data-deletion/story-audio-storage-key';

@Injectable()
export class UserAccountDeletionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly objectDeletionQueue: ObjectDeletionQueueService,
  ) {}

  async deleteAccount(userId: string, email: string): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const storyRows: Array<{ id: string; audioUrl: string | null }> = await manager.query(
        `WITH RECURSIVE "owned_story_tree"("id") AS (
           SELECT "id" FROM "stories" WHERE "userId" = $1
           UNION
           SELECT "share"."clonedResourceId"
           FROM "shares" "share"
           INNER JOIN "owned_story_tree" "tree" ON "share"."resourceId" = "tree"."id"
           WHERE "share"."resourceType" = 'story'
             AND "share"."clonedResourceId" IS NOT NULL
         )
         SELECT "story"."id", "story"."audioUrl"
         FROM "stories" "story"
         INNER JOIN "owned_story_tree" "tree" ON "tree"."id" = "story"."id"`,
        [userId],
      );
      const sharedStoryIds = storyRows.map(row => row.id);
      await this.objectDeletionQueue.enqueue(
        manager,
        userId,
        storyRows
          .map(row => row.audioUrl ? storyAudioStorageKey(row.audioUrl) : null)
          .filter((storageKey): storageKey is string => storageKey !== null)
          .map(storageKey => ({ storageKey, kind: 'story-audio' })),
      );
      await manager.query(
        `DELETE FROM "share_sync_links"
         WHERE "shareId" IN (
           SELECT "id" FROM "shares"
           WHERE "senderUserId" = $1
              OR "recipientUserId" = $1
              OR LOWER("senderEmail") = LOWER($2)
              OR LOWER("recipientEmail") = LOWER($2)
         )
            OR "sourceResourceId" = ANY($3::varchar[])
            OR "targetResourceId" = ANY($3::varchar[])`,
        [userId, email, sharedStoryIds],
      );
      await manager.query(
        `DELETE FROM "shares"
         WHERE "senderUserId" = $1
            OR "recipientUserId" = $1
            OR LOWER("senderEmail") = LOWER($2)
            OR LOWER("recipientEmail") = LOWER($2)
            OR "resourceId" = ANY($3::varchar[])
            OR "clonedResourceId" = ANY($3::varchar[])`,
        [userId, email, sharedStoryIds],
      );
      await manager.query(
        'DELETE FROM "stories" WHERE "id" = ANY($1::varchar[])',
        [sharedStoryIds],
      );
      await manager.query(
        `DELETE FROM "user_collection_items"
         WHERE "collectionId" IN (SELECT "id" FROM "collections" WHERE "userId" = $1)
            OR "learningItemId" IN (SELECT "id" FROM "learning_items" WHERE "userId" = $1)`,
        [userId],
      );

      for (const target of USER_OWNED_TABLES) {
        await manager.query(
          `DELETE FROM "${target.table}" WHERE "${target.userIdColumn}" = $1`,
          [userId],
        );
      }

      await manager.query('DELETE FROM "users" WHERE "id" = $1', [userId]);
    });
  }
}

const USER_OWNED_TABLES = [
  { table: 'podcast_listening_progress', userIdColumn: 'userId' },
  { table: 'streak_freeze_transactions', userIdColumn: 'userId' },
  { table: 'reward_transactions', userIdColumn: 'userId' },
  { table: 'daily_progress', userIdColumn: 'userId' },
  { table: 'daily_review_cards', userIdColumn: 'userId' },
  { table: 'engagement_processed_events', userIdColumn: 'userId' },
  { table: 'card_administration_events', userIdColumn: 'userId' },
  { table: 'review_commits', userIdColumn: 'userId' },
  { table: 'review_sessions', userIdColumn: 'userId' },
  { table: 'user_story_progress', userIdColumn: 'userId' },
  { table: 'stories', userIdColumn: 'userId' },
  { table: 'push_subscriptions', userIdColumn: 'user_id' },
  { table: 'discount_redemptions', userIdColumn: 'user_id' },
  { table: 'subscriptions', userIdColumn: 'user_id' },
  { table: 'user_settings', userIdColumn: 'user_id' },
  { table: 'account_deletion_requests', userIdColumn: 'user_id' },
  { table: 'categories', userIdColumn: 'userId' },
  { table: 'cards', userIdColumn: 'userId' },
  { table: 'collections', userIdColumn: 'userId' },
  { table: 'learning_items', userIdColumn: 'userId' },
  { table: 'learning_contexts', userIdColumn: 'userId' },
] as const;
