import { MigrationInterface, QueryRunner } from 'typeorm';
import { BackfillCanonicalLearningItems1787440000000 } from './BackfillCanonicalLearningItems';

export class ReconcileCanonicalLearningItems1787441000000 implements MigrationInterface {
  name = 'ReconcileCanonicalLearningItems1787441000000';

  async up(queryRunner: QueryRunner): Promise<void> {
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
