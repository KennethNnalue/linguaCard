import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMultilingualVocabulary1787436000000 implements MigrationInterface {
  name = 'CreateMultilingualVocabulary1787436000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SELECT pg_advisory_xact_lock($1)', [7_314_209_003]);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "languages" (
        "code" varchar(10) PRIMARY KEY,
        "displayName" varchar(80) NOT NULL,
        "defaultLocale" varchar(20) NOT NULL,
        "textDirection" varchar(3) NOT NULL DEFAULT 'ltr',
        "isSourceEnabled" boolean NOT NULL DEFAULT false,
        "isTargetEnabled" boolean NOT NULL DEFAULT false,
        "targetSpeechPolicy" varchar(20) NOT NULL DEFAULT 'synthesized',
        "sourceSpeechPolicy" varchar(20) NOT NULL DEFAULT 'device',
        CONSTRAINT "ck_languages_text_direction" CHECK ("textDirection" IN ('ltr', 'rtl')),
        CONSTRAINT "ck_languages_target_speech" CHECK ("targetSpeechPolicy" IN ('synthesized', 'device')),
        CONSTRAINT "ck_languages_source_speech" CHECK ("sourceSpeechPolicy" IN ('synthesized', 'device'))
      )
    `);
    await queryRunner.query(`
      INSERT INTO "languages"
        ("code", "displayName", "defaultLocale", "textDirection", "isSourceEnabled", "isTargetEnabled", "targetSpeechPolicy", "sourceSpeechPolicy")
      VALUES
        ('en', 'English', 'en-US', 'ltr', true, false, 'device', 'device'),
        ('de', 'German', 'de-DE', 'ltr', false, true, 'synthesized', 'device'),
        ('ar', 'Arabic', 'ar-SA', 'rtl', false, false, 'device', 'device'),
        ('es', 'Spanish', 'es-ES', 'ltr', false, false, 'device', 'device'),
        ('fr', 'French', 'fr-FR', 'ltr', false, false, 'device', 'device'),
        ('it', 'Italian', 'it-IT', 'ltr', false, false, 'device', 'device'),
        ('pt', 'Portuguese', 'pt-PT', 'ltr', false, false, 'device', 'device'),
        ('ja', 'Japanese', 'ja-JP', 'ltr', false, false, 'device', 'device'),
        ('zh', 'Chinese', 'zh-CN', 'ltr', false, false, 'device', 'device'),
        ('ko', 'Korean', 'ko-KR', 'ltr', false, false, 'device', 'device'),
        ('uk', 'Ukrainian', 'uk-UA', 'ltr', false, false, 'device', 'device'),
        ('tr', 'Turkish', 'tr-TR', 'ltr', false, false, 'device', 'device'),
        ('ru', 'Russian', 'ru-RU', 'ltr', false, false, 'device', 'device')
      ON CONFLICT ("code") DO NOTHING
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "lexemes" (
        "id" varchar PRIMARY KEY,
        "language" varchar(10) NOT NULL REFERENCES "languages"("code"),
        "normalizedLemma" varchar(500) NOT NULL,
        "displayText" varchar(500) NOT NULL,
        "partOfSpeech" varchar(40) NOT NULL DEFAULT 'other',
        "grammarDiscriminator" varchar(200) NOT NULL DEFAULT '',
        "grammar" jsonb NOT NULL DEFAULT '{}',
        "phonetic" varchar(200),
        "cefrLevel" varchar(5),
        "source" varchar(30) NOT NULL,
        "model" varchar(200),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_lexemes_identity" UNIQUE ("language", "normalizedLemma", "partOfSpeech", "grammarDiscriminator")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_lexemes_language_lemma" ON "lexemes" ("language", "normalizedLemma")`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "lexeme_localizations" (
        "id" varchar PRIMARY KEY,
        "lexemeId" varchar NOT NULL REFERENCES "lexemes"("id") ON DELETE CASCADE,
        "language" varchar(10) NOT NULL REFERENCES "languages"("code"),
        "translation" varchar(500) NOT NULL,
        "definition" text,
        "synonyms" jsonb NOT NULL DEFAULT '[]',
        "status" varchar(20) NOT NULL DEFAULT 'ready',
        "contentVersion" integer NOT NULL DEFAULT 1,
        "isActive" boolean NOT NULL DEFAULT true,
        "source" varchar(30) NOT NULL,
        "model" varchar(200),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_lexeme_localizations_version" UNIQUE ("lexemeId", "language", "contentVersion"),
        CONSTRAINT "ck_lexeme_localizations_status" CHECK ("status" IN ('pending', 'ready', 'failed', 'needs_review')),
        CONSTRAINT "ck_lexeme_localizations_version" CHECK ("contentVersion" > 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_lexeme_localizations_lexeme_language" ON "lexeme_localizations" ("lexemeId", "language")`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_lexeme_localizations_active"
      ON "lexeme_localizations" ("lexemeId", "language") WHERE "isActive" = true
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "example_sentences" (
        "id" varchar PRIMARY KEY,
        "lexemeId" varchar NOT NULL REFERENCES "lexemes"("id") ON DELETE CASCADE,
        "language" varchar(10) NOT NULL REFERENCES "languages"("code"),
        "normalizedText" varchar(1000) NOT NULL,
        "displayText" varchar(1000) NOT NULL,
        "position" integer NOT NULL DEFAULT 0,
        "source" varchar(30) NOT NULL,
        "model" varchar(200),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_example_sentences_identity" UNIQUE ("lexemeId", "language", "normalizedText")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_example_sentences_lexeme" ON "example_sentences" ("lexemeId")`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "example_localizations" (
        "id" varchar PRIMARY KEY,
        "exampleSentenceId" varchar NOT NULL REFERENCES "example_sentences"("id") ON DELETE CASCADE,
        "language" varchar(10) NOT NULL REFERENCES "languages"("code"),
        "text" varchar(1000) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'ready',
        "contentVersion" integer NOT NULL DEFAULT 1,
        "isActive" boolean NOT NULL DEFAULT true,
        "source" varchar(30) NOT NULL,
        "model" varchar(200),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_example_localizations_version" UNIQUE ("exampleSentenceId", "language", "contentVersion"),
        CONSTRAINT "ck_example_localizations_status" CHECK ("status" IN ('pending', 'ready', 'failed', 'needs_review')),
        CONSTRAINT "ck_example_localizations_version" CHECK ("contentVersion" > 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_example_localizations_example_language" ON "example_localizations" ("exampleSentenceId", "language")`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_example_localizations_active"
      ON "example_localizations" ("exampleSentenceId", "language") WHERE "isActive" = true
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "speech_assets" (
        "id" varchar PRIMARY KEY,
        "identityKey" varchar(64) NOT NULL,
        "language" varchar(10) NOT NULL REFERENCES "languages"("code"),
        "normalizedText" varchar(1000) NOT NULL,
        "displayText" varchar(1000) NOT NULL,
        "voiceKey" varchar(100) NOT NULL,
        "profileVersion" integer NOT NULL,
        "contentKind" varchar(20) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "leaseOwner" varchar,
        "leaseExpiresAt" timestamptz,
        "attemptCount" integer NOT NULL DEFAULT 0,
        "nextRetryAt" timestamptz,
        "audioUrl" varchar(1000),
        "storagePath" varchar(500),
        "mimeType" varchar(100),
        "durationMs" integer NOT NULL DEFAULT 0,
        "checksum" varchar(64),
        "failureReason" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_speech_assets_identity" UNIQUE ("identityKey"),
        CONSTRAINT "ck_speech_assets_profile_version" CHECK ("profileVersion" > 0),
        CONSTRAINT "ck_speech_assets_content_kind" CHECK ("contentKind" IN ('word', 'example', 'sentence')),
        CONSTRAINT "ck_speech_assets_status" CHECK ("status" IN ('pending', 'generating', 'ready', 'failed')),
        CONSTRAINT "ck_speech_assets_attempt_count" CHECK ("attemptCount" >= 0),
        CONSTRAINT "ck_speech_assets_duration" CHECK ("durationMs" >= 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_speech_assets_language_text" ON "speech_assets" ("language", md5("normalizedText"))`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_speech_assets_status_retry" ON "speech_assets" ("status", "nextRetryAt")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "speech_assets"');
    await queryRunner.query('DROP TABLE IF EXISTS "example_localizations"');
    await queryRunner.query('DROP TABLE IF EXISTS "example_sentences"');
    await queryRunner.query('DROP TABLE IF EXISTS "lexeme_localizations"');
    await queryRunner.query('DROP TABLE IF EXISTS "lexemes"');
    await queryRunner.query('DROP TABLE IF EXISTS "languages"');
  }
}
