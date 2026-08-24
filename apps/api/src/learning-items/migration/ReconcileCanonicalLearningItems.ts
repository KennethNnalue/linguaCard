import { MigrationInterface, QueryRunner } from 'typeorm';
import { BackfillCanonicalLearningItems1787440000000 } from './BackfillCanonicalLearningItems';

export class ReconcileCanonicalLearningItems1787441000000 implements MigrationInterface {
  name = 'ReconcileCanonicalLearningItems1787441000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_migration_markers (
        key varchar PRIMARY KEY,
        "completedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    const completed: Array<{ completed: boolean }> = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM data_migration_markers
        WHERE key = 'canonical-learning-items-v2'
      ) AS completed
    `);
    if (completed[0]?.completed) {
      return;
    }

    // Some databases applied the first backfill before dictionary-unlinked cards
    // were included. The backfill is idempotent, so replaying it under a new
    // migration identity reconciles both previously migrated and fresh databases.
    await new BackfillCanonicalLearningItems1787440000000().up(queryRunner);
  }

  async down(): Promise<void> {
    // Reversing canonical data projection could delete resources referenced by
    // learning items created after deployment, so reconciliation is forward-only.
  }
}
