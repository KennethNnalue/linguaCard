import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPodcastLearningLoop1787445000000 implements MigrationInterface {
  name = 'AddPodcastLearningLoop1787445000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE collections ADD COLUMN IF NOT EXISTS "sourcePodcastEpisodeId" varchar NULL');
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_collections_podcast_episode'
        ) THEN
          ALTER TABLE collections ADD CONSTRAINT fk_collections_podcast_episode
            FOREIGN KEY ("sourcePodcastEpisodeId") REFERENCES podcast_episodes(id) ON DELETE SET NULL;
        END IF;
      END
      $$
    `);
    await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_collections_user_podcast_episode ON collections ("userId", "sourcePodcastEpisodeId") WHERE "sourcePodcastEpisodeId" IS NOT NULL');
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS podcast_listening_progress (
      id varchar PRIMARY KEY, "userId" varchar NOT NULL, "episodeId" varchar NOT NULL,
      "audioVersion" integer NOT NULL, "positionMs" integer NOT NULL DEFAULT 0,
      "completedAt" timestamptz NULL, "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_podcast_progress_user_episode UNIQUE ("userId", "episodeId"),
      CONSTRAINT fk_podcast_progress_user FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_podcast_progress_episode FOREIGN KEY ("episodeId") REFERENCES podcast_episodes(id) ON DELETE CASCADE,
      CONSTRAINT ck_podcast_progress_position CHECK ("positionMs" >= 0 AND "positionMs" <= 300000)
    )`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS podcast_listening_progress');
    await queryRunner.query('DROP INDEX IF EXISTS uq_collections_user_podcast_episode');
    await queryRunner.query('ALTER TABLE collections DROP CONSTRAINT IF EXISTS fk_collections_podcast_episode');
    await queryRunner.query('ALTER TABLE collections DROP COLUMN IF EXISTS "sourcePodcastEpisodeId"');
  }
}
