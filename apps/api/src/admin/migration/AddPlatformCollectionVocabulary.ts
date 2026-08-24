import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlatformCollectionVocabulary1787439000000 implements MigrationInterface {
  name = 'AddPlatformCollectionVocabulary1787439000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE platform_collections ADD COLUMN IF NOT EXISTS "externalId" varchar(120)`);
    await queryRunner.query(`ALTER TABLE platform_collections ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE platform_collections ADD COLUMN IF NOT EXISTS "sourceLanguage" varchar(10) NOT NULL DEFAULT 'en'`);
    await queryRunner.query(`ALTER TABLE platform_collections ADD COLUMN IF NOT EXISTS "targetLanguage" varchar(10) NOT NULL DEFAULT 'de'`);
    await queryRunner.query(`ALTER TABLE platform_collections ADD COLUMN IF NOT EXISTS "coverSeed" varchar(200)`);
    await queryRunner.query(`ALTER TABLE platform_collections ADD COLUMN IF NOT EXISTS "coverImageUrl" varchar(1000)`);
    await queryRunner.query(`ALTER TABLE platform_collections ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'draft'`);
    await queryRunner.query(`ALTER TABLE platform_collections ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now()`);
    await queryRunner.query(`ALTER TABLE platform_collections ADD COLUMN IF NOT EXISTS "publishedAt" timestamptz`);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE platform_collections
          ADD CONSTRAINT fk_platform_collections_source_language
          FOREIGN KEY ("sourceLanguage") REFERENCES languages(code);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE platform_collections
          ADD CONSTRAINT fk_platform_collections_target_language
          FOREIGN KEY ("targetLanguage") REFERENCES languages(code);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE platform_collections
          ADD CONSTRAINT ck_platform_collections_different_languages
          CHECK ("sourceLanguage" <> "targetLanguage");
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_platform_collections_discovery ON platform_collections ("sourceLanguage", "targetLanguage", "isPublished", level)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_collections_external_id ON platform_collections ("externalId") WHERE "externalId" IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE platform_collection_words ADD COLUMN IF NOT EXISTS "lexemeId" varchar`);
    await queryRunner.query(`
      UPDATE platform_collection_words item
      SET "lexemeId" = mapping."lexemeId"
      FROM legacy_dictionary_lexemes mapping
      WHERE mapping."dictionaryWordId" = item."dictionaryWordId"
        AND item."lexemeId" IS NULL
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE platform_collection_words
          ADD CONSTRAINT fk_platform_collection_words_lexeme
          FOREIGN KEY ("lexemeId") REFERENCES lexemes(id);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_pcw_lexeme ON platform_collection_words ("lexemeId")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_pcw_collection_lexeme ON platform_collection_words ("platformCollectionId", "lexemeId") WHERE "lexemeId" IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE platform_collection_imports ADD COLUMN IF NOT EXISTS stage varchar(30) NOT NULL DEFAULT 'queued'`);
    await queryRunner.query(`ALTER TABLE platform_collection_imports ADD COLUMN IF NOT EXISTS "processedItems" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE platform_collection_imports ADD COLUMN IF NOT EXISTS "totalItems" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE platform_collection_imports ADD COLUMN IF NOT EXISTS "rowErrors" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await queryRunner.query(`ALTER TABLE platform_collection_imports ADD COLUMN IF NOT EXISTS payload jsonb`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE platform_collection_imports DROP COLUMN IF EXISTS payload');
    await queryRunner.query(`ALTER TABLE platform_collection_imports DROP COLUMN IF EXISTS "rowErrors"`);
    await queryRunner.query(`ALTER TABLE platform_collection_imports DROP COLUMN IF EXISTS "totalItems"`);
    await queryRunner.query(`ALTER TABLE platform_collection_imports DROP COLUMN IF EXISTS "processedItems"`);
    await queryRunner.query('ALTER TABLE platform_collection_imports DROP COLUMN IF EXISTS stage');
    await queryRunner.query('DROP INDEX IF EXISTS uq_pcw_collection_lexeme');
    await queryRunner.query('DROP INDEX IF EXISTS idx_pcw_lexeme');
    await queryRunner.query('ALTER TABLE platform_collection_words DROP CONSTRAINT IF EXISTS fk_platform_collection_words_lexeme');
    await queryRunner.query(`ALTER TABLE platform_collection_words DROP COLUMN IF EXISTS "lexemeId"`);
    await queryRunner.query('DROP INDEX IF EXISTS uq_platform_collections_external_id');
    await queryRunner.query('DROP INDEX IF EXISTS idx_platform_collections_discovery');
    await queryRunner.query('ALTER TABLE platform_collections DROP CONSTRAINT IF EXISTS ck_platform_collections_different_languages');
    await queryRunner.query('ALTER TABLE platform_collections DROP CONSTRAINT IF EXISTS fk_platform_collections_target_language');
    await queryRunner.query('ALTER TABLE platform_collections DROP CONSTRAINT IF EXISTS fk_platform_collections_source_language');
    await queryRunner.query('ALTER TABLE platform_collections DROP COLUMN IF EXISTS status');
    await queryRunner.query(`ALTER TABLE platform_collections DROP COLUMN IF EXISTS "publishedAt"`);
    await queryRunner.query(`ALTER TABLE platform_collections DROP COLUMN IF EXISTS "updatedAt"`);
    await queryRunner.query(`ALTER TABLE platform_collections DROP COLUMN IF EXISTS "coverImageUrl"`);
    await queryRunner.query(`ALTER TABLE platform_collections DROP COLUMN IF EXISTS "coverSeed"`);
    await queryRunner.query(`ALTER TABLE platform_collections DROP COLUMN IF EXISTS "targetLanguage"`);
    await queryRunner.query(`ALTER TABLE platform_collections DROP COLUMN IF EXISTS "sourceLanguage"`);
    await queryRunner.query('ALTER TABLE platform_collections DROP COLUMN IF EXISTS description');
    await queryRunner.query(`ALTER TABLE platform_collections DROP COLUMN IF EXISTS "externalId"`);
  }
}
