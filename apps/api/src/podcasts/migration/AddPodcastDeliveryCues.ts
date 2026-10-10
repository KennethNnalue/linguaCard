import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPodcastDeliveryCues1791633600000 implements MigrationInterface {
  name = 'AddPodcastDeliveryCues1791633600000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE podcast_turns ADD COLUMN IF NOT EXISTS "audioTags" jsonb NOT NULL DEFAULT '[]'::jsonb`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE podcast_turns DROP COLUMN IF EXISTS "audioTags"');
  }
}
