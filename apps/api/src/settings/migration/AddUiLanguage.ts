import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUiLanguage1750300000000 implements MigrationInterface {
  name = 'AddUiLanguage1750300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_settings"
      ADD COLUMN IF NOT EXISTS "ui_language" VARCHAR(10) NOT NULL DEFAULT 'en'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_settings"
      DROP COLUMN IF EXISTS "ui_language"
    `);
  }
}
