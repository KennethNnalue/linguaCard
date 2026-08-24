import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlatformCollectionImports1787438000000 implements MigrationInterface {
  name = 'CreatePlatformCollectionImports1787438000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS platform_collection_imports (
        id varchar PRIMARY KEY,
        fingerprint varchar(64) NOT NULL,
        status varchar(20) NOT NULL,
        "collectionId" varchar NULL,
        title varchar(120) NOT NULL,
        inserted integer NOT NULL DEFAULT 0,
        reused integer NOT NULL DEFAULT 0,
        "audioLinked" integer NOT NULL DEFAULT 0,
        error text NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_platform_collection_imports_fingerprint UNIQUE (fingerprint)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS platform_collection_imports');
  }
}
