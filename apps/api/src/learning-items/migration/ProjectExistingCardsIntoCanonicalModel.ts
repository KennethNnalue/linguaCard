import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProjectExistingCardsIntoCanonicalModel1787441000000 implements MigrationInterface {
  name = 'ProjectExistingCardsIntoCanonicalModel1787441000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SELECT pg_advisory_xact_lock($1)', [7_314_209_007]);
    await queryRunner.query(`
      UPDATE cards card
      SET "collectionId" = NULL
      WHERE card."collectionId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM collections collection
          WHERE collection.id = card."collectionId"
            AND collection."userId" = card."userId"
        )
    `);
    await queryRunner.query(`
      UPDATE cards
      SET content = content
      WHERE "contextId" = 'german-vocab'
    `);
  }

  async down(): Promise<void> {}
}
