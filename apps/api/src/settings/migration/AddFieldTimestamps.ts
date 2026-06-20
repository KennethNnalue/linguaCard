import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFieldTimestamps1750400000000 implements MigrationInterface {
  name = 'AddFieldTimestamps1750400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_settings"
      ADD COLUMN IF NOT EXISTS "field_timestamps" JSONB NOT NULL DEFAULT '{}'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_settings"
      DROP COLUMN IF EXISTS "field_timestamps"
    `);
  }
}
