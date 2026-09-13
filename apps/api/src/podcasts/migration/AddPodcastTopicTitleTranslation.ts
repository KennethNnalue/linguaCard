import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPodcastTopicTitleTranslation1787455000000 implements MigrationInterface {
  name = 'AddPodcastTopicTitleTranslation1787455000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE podcast_topics ADD COLUMN IF NOT EXISTS "titleTranslation" varchar(160) NOT NULL DEFAULT ''`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE podcast_topics DROP COLUMN IF EXISTS "titleTranslation"`);
  }
}
