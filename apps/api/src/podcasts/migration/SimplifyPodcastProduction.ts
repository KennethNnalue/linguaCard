import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SimplifyPodcastProduction1787450000000 implements MigrationInterface {
  name = 'SimplifyPodcastProduction1787450000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE podcast_topics ADD COLUMN IF NOT EXISTS level varchar(4)');
    await queryRunner.query('UPDATE podcast_topics SET level = "minimumLevel" WHERE level IS NULL');
    await queryRunner.query('ALTER TABLE podcast_topics ALTER COLUMN level SET NOT NULL');
    await queryRunner.query(`
      UPDATE podcast_episodes AS episode
      SET level = topic.level
      FROM podcast_topics AS topic
      WHERE episode."topicId" = topic.id AND episode.level <> topic.level
    `);
    await queryRunner.query('ALTER TABLE podcast_topics DROP CONSTRAINT IF EXISTS ck_podcast_topics_levels');
    await queryRunner.query("ALTER TABLE podcast_topics ADD CONSTRAINT ck_podcast_topics_level CHECK (level IN ('A1','A2','B1','B2','C1'))");
    await queryRunner.query('ALTER TABLE podcast_topics DROP COLUMN "minimumLevel", DROP COLUMN "maximumLevel"');
    await queryRunner.query(`
      ALTER TABLE podcast_episodes
      ADD COLUMN IF NOT EXISTS "generationRequestId" varchar(36) NULL,
      ADD COLUMN IF NOT EXISTS "generationInput" jsonb NULL,
      ADD COLUMN IF NOT EXISTS "elevenLabsProjectId" varchar(160) NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_podcast_episodes_generation_request
      ON podcast_episodes ("generationRequestId") WHERE "generationRequestId" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS uq_podcast_episodes_generation_request');
    await queryRunner.query(`
      ALTER TABLE podcast_episodes
      DROP COLUMN IF EXISTS "elevenLabsProjectId",
      DROP COLUMN IF EXISTS "generationInput",
      DROP COLUMN IF EXISTS "generationRequestId"
    `);
    await queryRunner.query('ALTER TABLE podcast_topics ADD COLUMN "minimumLevel" varchar(4), ADD COLUMN "maximumLevel" varchar(4)');
    await queryRunner.query('UPDATE podcast_topics SET "minimumLevel" = level, "maximumLevel" = level');
    await queryRunner.query('ALTER TABLE podcast_topics ALTER COLUMN "minimumLevel" SET NOT NULL, ALTER COLUMN "maximumLevel" SET NOT NULL');
    await queryRunner.query('ALTER TABLE podcast_topics DROP CONSTRAINT IF EXISTS ck_podcast_topics_level');
    await queryRunner.query("ALTER TABLE podcast_topics ADD CONSTRAINT ck_podcast_topics_levels CHECK (\"minimumLevel\" IN ('A1','A2','B1','B2','C1') AND \"maximumLevel\" IN ('A1','A2','B1','B2','C1'))");
    await queryRunner.query('ALTER TABLE podcast_topics DROP COLUMN level');
  }
}
