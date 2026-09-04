import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class UserAccountDeletionService {
  constructor(private readonly dataSource: DataSource) {}

  async deleteAccount(userId: string, email: string): Promise<void> {
    await this.dataSource.transaction(async manager => {
      await manager.query(
        `DELETE FROM "share_sync_links"
         WHERE "shareId" IN (
           SELECT "id" FROM "shares"
           WHERE "senderUserId" = $1
              OR "recipientUserId" = $1
              OR LOWER("senderEmail") = LOWER($2)
              OR LOWER("recipientEmail") = LOWER($2)
         )`,
        [userId, email],
      );
      await manager.query(
        `DELETE FROM "shares"
         WHERE "senderUserId" = $1
            OR "recipientUserId" = $1
            OR LOWER("senderEmail") = LOWER($2)
            OR LOWER("recipientEmail") = LOWER($2)`,
        [userId, email],
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
  { table: 'categories', userIdColumn: 'userId' },
  { table: 'cards', userIdColumn: 'userId' },
  { table: 'collections', userIdColumn: 'userId' },
  { table: 'learning_items', userIdColumn: 'userId' },
  { table: 'learning_contexts', userIdColumn: 'userId' },
] as const;
