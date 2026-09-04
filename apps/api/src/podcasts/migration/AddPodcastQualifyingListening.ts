import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPodcastQualifyingListening1787449000000 implements MigrationInterface {
  name = 'AddPodcastQualifyingListening1787449000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "podcast_listening_progress"
      ADD COLUMN IF NOT EXISTS "qualifyingListenedMs" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "podcast_listening_progress"
      ADD COLUMN IF NOT EXISTS "listenedRanges" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "podcast_listening_progress"
      DROP COLUMN IF EXISTS "qualifyingListenedMs"
    `);
    await queryRunner.query(`
      ALTER TABLE "podcast_listening_progress"
      DROP COLUMN IF EXISTS "listenedRanges"
    `);
  }
}
