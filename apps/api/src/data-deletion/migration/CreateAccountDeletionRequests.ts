import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAccountDeletionRequests1787452000000 implements MigrationInterface {
  name = 'CreateAccountDeletionRequests1787452000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "account_deletion_requests" (
        "id" uuid PRIMARY KEY,
        "user_id" varchar NOT NULL,
        "email" varchar(320) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_account_deletion_requests_pending_user"
      ON "account_deletion_requests" ("user_id") WHERE "status" = 'pending'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "account_deletion_requests"');
  }
}
