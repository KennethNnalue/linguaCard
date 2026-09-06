import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateObjectDeletionJobs1787451000000 implements MigrationInterface {
  name = 'CreateObjectDeletionJobs1787451000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "object_deletion_jobs" (
        "id" uuid PRIMARY KEY,
        "owner_user_id" varchar NULL,
        "storage_key" varchar(1000) NOT NULL,
        "kind" varchar(40) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "attempts" integer NOT NULL DEFAULT 0,
        "next_attempt_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "locked_at" timestamptz NULL,
        "last_error" text NULL,
        "completed_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "uq_object_deletion_jobs_storage_key" UNIQUE ("storage_key")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_object_deletion_jobs_due"
      ON "object_deletion_jobs" ("status", "next_attempt_at")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "object_deletion_jobs"');
  }
}
