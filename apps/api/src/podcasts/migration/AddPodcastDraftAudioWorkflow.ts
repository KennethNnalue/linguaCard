import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPodcastDraftAudioWorkflow1787457000000 implements MigrationInterface {
  name = 'AddPodcastDraftAudioWorkflow1787457000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE podcast_episodes
      ADD COLUMN IF NOT EXISTS "audioGenerationStatus" varchar(16) NOT NULL DEFAULT 'idle',
      ADD COLUMN IF NOT EXISTS "audioGenerationAttemptId" varchar(36) NULL,
      ADD COLUMN IF NOT EXISTS "approvedAudioVersion" integer NULL
    `);
    await queryRunner.query(`
      UPDATE podcast_episodes SET "approvedAudioVersion" = "audioVersion"
      WHERE status = 'published' AND "audioVersion" > 0
    `);
    await queryRunner.query(`
      UPDATE podcast_episodes
      SET status = CASE WHEN "audioUrl" IS NULL THEN 'draft' ELSE 'ready_for_review' END
      WHERE status IN ('generating', 'queued')
        AND "transcriptFingerprint" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE podcast_episodes
      DROP COLUMN IF EXISTS "approvedAudioVersion",
      DROP COLUMN IF EXISTS "audioGenerationAttemptId",
      DROP COLUMN IF EXISTS "audioGenerationStatus"
    `);
  }
}
