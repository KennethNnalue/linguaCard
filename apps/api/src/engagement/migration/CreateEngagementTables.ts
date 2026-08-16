import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEngagementTables1760000000000 implements MigrationInterface {
  name = 'CreateEngagementTables1760000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "engagement_processed_events" (
        "userId" varchar NOT NULL,
        "eventId" varchar NOT NULL,
        "dayKey" date NOT NULL,
        "processedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_engagement_processed_events" PRIMARY KEY ("userId", "eventId")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "daily_review_cards" (
        "userId" varchar NOT NULL,
        "dayKey" date NOT NULL,
        "cardId" varchar NOT NULL,
        "sourceEventId" varchar NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_daily_review_cards" PRIMARY KEY ("userId", "dayKey", "cardId")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "daily_progress" (
        "userId" varchar NOT NULL,
        "dayKey" date NOT NULL,
        "targetUniqueCards" integer NOT NULL,
        "uniqueCardsReviewed" integer NOT NULL DEFAULT 0,
        "committedReviewCount" integer NOT NULL DEFAULT 0,
        "goalReachedAt" timestamptz,
        "firstGoalReachingEventId" varchar,
        CONSTRAINT "PK_daily_progress" PRIMARY KEY ("userId", "dayKey")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reward_transactions" (
        "transactionId" varchar PRIMARY KEY,
        "userId" varchar NOT NULL,
        "occurredAt" timestamptz NOT NULL,
        "dayKey" date NOT NULL,
        "amount" integer NOT NULL,
        "reason" varchar NOT NULL,
        "sourceEventId" varchar NOT NULL,
        "deduplicationKey" varchar NOT NULL,
        "sessionId" varchar,
        "cardId" varchar,
        CONSTRAINT "uq_reward_transactions_user_deduplication" UNIQUE ("userId", "deduplicationKey")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "streak_freeze_transactions" (
        "transactionId" varchar PRIMARY KEY,
        "userId" varchar NOT NULL,
        "occurredAt" timestamptz NOT NULL,
        "amount" integer NOT NULL,
        "reason" varchar NOT NULL,
        "protectedDayKey" date,
        "sourceId" varchar NOT NULL,
        CONSTRAINT "uq_streak_freeze_user_source" UNIQUE ("userId", "sourceId")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_streak_freeze_user_protected_day"
      ON "streak_freeze_transactions" ("userId", "protectedDayKey")
      WHERE "reason" = 'consumed'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "streak_freeze_transactions"');
    await queryRunner.query('DROP TABLE "reward_transactions"');
    await queryRunner.query('DROP TABLE "daily_progress"');
    await queryRunner.query('DROP TABLE "daily_review_cards"');
    await queryRunner.query('DROP TABLE "engagement_processed_events"');
  }
}
