import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCollectionTitleTranslation1787454000000 implements MigrationInterface {
  name = 'AddCollectionTitleTranslation1787454000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE platform_collections ADD COLUMN IF NOT EXISTS "titleTranslation" varchar(120)`);
    await queryRunner.query(`ALTER TABLE collections ADD COLUMN IF NOT EXISTS "titleTranslation" varchar(120)`);
    await queryRunner.query(`
      UPDATE collections AS user_collection
      SET level = platform.level,
          "titleTranslation" = platform."titleTranslation"
      FROM platform_collections AS platform
      WHERE user_collection."sourcePlatformCollectionId" = platform.id
        AND (user_collection.level IS NULL OR user_collection."titleTranslation" IS NULL)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE collections DROP COLUMN IF EXISTS "titleTranslation"`);
    await queryRunner.query(`ALTER TABLE platform_collections DROP COLUMN IF EXISTS "titleTranslation"`);
  }
}
