import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWordDictionary1749600000000 implements MigrationInterface {
  name = 'CreateWordDictionary1749600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "word_dictionary" (
        "id"           VARCHAR NOT NULL,
        "lemmaKey"     VARCHAR(500) NOT NULL,
        "targetLang"   VARCHAR(10) NOT NULL DEFAULT 'de-DE',
        "nativeLang"   VARCHAR(10) NOT NULL DEFAULT 'en',
        "displayText"  VARCHAR(500) NOT NULL,
        "article"      VARCHAR(10),
        "gender"       VARCHAR(20),
        "translation"  VARCHAR(500) NOT NULL,
        "wordType"     VARCHAR(20) NOT NULL DEFAULT 'other',
        "phonetic"     VARCHAR(200),
        "cefrLevel"    VARCHAR(5),
        "categoryName" VARCHAR(100) NOT NULL DEFAULT 'Other',
        "examples"     JSONB NOT NULL DEFAULT '[]',
        "synonyms"     JSONB NOT NULL DEFAULT '[]',
        "plurals"      TEXT[] NOT NULL DEFAULT '{}',
        "wordAudioId"  VARCHAR(100),
        "source"       VARCHAR(30) NOT NULL DEFAULT 'ai-enrich',
        "model"        VARCHAR(200),
        "enrichedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_word_dictionary" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_word_dict_lemma_langs"
        ON "word_dictionary" ("lemmaKey", "targetLang", "nativeLang")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_word_dict_lemma" ON "word_dictionary" ("lemmaKey")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_word_dict_audio" ON "word_dictionary" ("wordAudioId")
      WHERE "wordAudioId" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "word_dictionary"`);
  }
}
