import type { MigrationInterface, QueryRunner } from 'typeorm';
export class AddPodcastEvents1787458000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS podcast_events (
      id varchar PRIMARY KEY, "userId" varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "episodeId" varchar NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
      name varchar NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', "createdAt" timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_podcast_events_user_time ON podcast_events ("userId", "createdAt")');
  }
  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.query('DROP TABLE IF EXISTS podcast_events'); }
}
