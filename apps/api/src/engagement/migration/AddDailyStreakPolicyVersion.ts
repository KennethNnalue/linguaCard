import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDailyStreakPolicyVersion1787448000000 implements MigrationInterface {
  name = 'AddDailyStreakPolicyVersion1787448000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "daily_progress"
      ADD COLUMN IF NOT EXISTS "streakPolicyVersion" integer NOT NULL DEFAULT 0
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "daily_progress"
      DROP COLUMN IF EXISTS "streakPolicyVersion"
    `);
  }
}
