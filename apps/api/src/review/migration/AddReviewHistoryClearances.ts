import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewHistoryClearances1787456000000 implements MigrationInterface {
  name = 'AddReviewHistoryClearances1787456000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "review_history_clearances" (
        "userId" varchar PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
        "clearedAt" timestamptz NOT NULL
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "review_history_clearances"');
  }
}
