import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPodcastAudioGeneration1787444000000 implements MigrationInterface {
  name = 'AddPodcastAudioGeneration1787444000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE podcast_episodes ADD COLUMN IF NOT EXISTS "generationError" text NULL');
    await queryRunner.query('ALTER TABLE podcast_turns ADD COLUMN IF NOT EXISTS "startMs" integer NULL');
    await queryRunner.query('ALTER TABLE podcast_turns ADD COLUMN IF NOT EXISTS "endMs" integer NULL');
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'ck_podcast_turn_timing'
        ) THEN
          ALTER TABLE podcast_turns ADD CONSTRAINT ck_podcast_turn_timing CHECK (
            ("startMs" IS NULL AND "endMs" IS NULL) OR
            ("startMs" >= 0 AND "endMs" >= "startMs" AND "endMs" <= 300000)
          );
        END IF;
      END
      $$
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE podcast_turns DROP CONSTRAINT IF EXISTS ck_podcast_turn_timing');
    await queryRunner.query('ALTER TABLE podcast_turns DROP COLUMN IF EXISTS "endMs"');
    await queryRunner.query('ALTER TABLE podcast_turns DROP COLUMN IF EXISTS "startMs"');
    await queryRunner.query('ALTER TABLE podcast_episodes DROP COLUMN IF EXISTS "generationError"');
  }
}
