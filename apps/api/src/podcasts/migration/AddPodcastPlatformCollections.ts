import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPodcastPlatformCollections1787453000000 implements MigrationInterface {
  name = 'AddPodcastPlatformCollections1787453000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE platform_collections ADD COLUMN IF NOT EXISTS "sourcePodcastEpisodeId" varchar NULL',
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'fk_platform_collections_podcast_episode'
        ) THEN
          ALTER TABLE platform_collections
            ADD CONSTRAINT fk_platform_collections_podcast_episode
            FOREIGN KEY ("sourcePodcastEpisodeId")
            REFERENCES podcast_episodes(id)
            ON DELETE SET NULL;
        END IF;
      END
      $$
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_collections_podcast_episode
      ON platform_collections ("sourcePodcastEpisodeId")
      WHERE "sourcePodcastEpisodeId" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_pcw_collection_dictionary
      ON platform_collection_words ("platformCollectionId", "dictionaryWordId")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS uq_pcw_collection_dictionary');
    await queryRunner.query('DROP INDEX IF EXISTS uq_platform_collections_podcast_episode');
    await queryRunner.query(
      'ALTER TABLE platform_collections DROP CONSTRAINT IF EXISTS fk_platform_collections_podcast_episode',
    );
    await queryRunner.query(
      'ALTER TABLE platform_collections DROP COLUMN IF EXISTS "sourcePodcastEpisodeId"',
    );
  }
}
