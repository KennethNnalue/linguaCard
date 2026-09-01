import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePodcasts1787442000000 implements MigrationInterface {
  name = 'CreatePodcasts1787442000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS podcast_thumbnail_assets (
        id varchar PRIMARY KEY,
        "originalUrl" varchar(1000) NOT NULL,
        "originalStoragePath" varchar(500) NOT NULL,
        "originalMimeType" varchar(50) NOT NULL,
        "originalWidth" integer NOT NULL,
        "originalHeight" integer NOT NULL,
        "cardUrl" varchar(1000) NOT NULL,
        "cardStoragePath" varchar(500) NOT NULL,
        "cardWidth" integer NOT NULL,
        "cardHeight" integer NOT NULL,
        "heroUrl" varchar(1000) NOT NULL,
        "heroStoragePath" varchar(500) NOT NULL,
        "heroWidth" integer NOT NULL,
        "heroHeight" integer NOT NULL,
        "accessibilityDescription" varchar(300) NOT NULL,
        "focalPointX" double precision NOT NULL DEFAULT 0.5,
        "focalPointY" double precision NOT NULL DEFAULT 0.5,
        "contentHash" varchar(64) NOT NULL,
        version integer NOT NULL DEFAULT 1,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_podcast_thumbnail_dimensions CHECK (
          "originalWidth" > 0 AND "originalHeight" > 0
          AND "cardWidth" > 0 AND "cardHeight" > 0
          AND "heroWidth" > 0 AND "heroHeight" > 0
        ),
        CONSTRAINT ck_podcast_thumbnail_focal_point CHECK (
          "focalPointX" BETWEEN 0 AND 1 AND "focalPointY" BETWEEN 0 AND 1
        )
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS podcast_topics (
        id varchar PRIMARY KEY,
        "externalId" varchar(120) NOT NULL,
        title varchar(160) NOT NULL,
        description text NOT NULL DEFAULT '',
        "targetLanguage" varchar(10) NOT NULL,
        "translationLanguage" varchar(10) NOT NULL,
        "minimumLevel" varchar(4) NOT NULL,
        "maximumLevel" varchar(4) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'draft',
        "thumbnailAssetId" varchar NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "publishedAt" timestamptz NULL,
        CONSTRAINT uq_podcast_topics_external_id UNIQUE ("externalId"),
        CONSTRAINT fk_podcast_topics_target_language FOREIGN KEY ("targetLanguage") REFERENCES languages(code),
        CONSTRAINT fk_podcast_topics_translation_language FOREIGN KEY ("translationLanguage") REFERENCES languages(code),
        CONSTRAINT fk_podcast_topics_thumbnail FOREIGN KEY ("thumbnailAssetId") REFERENCES podcast_thumbnail_assets(id) ON DELETE SET NULL,
        CONSTRAINT ck_podcast_topics_languages CHECK ("targetLanguage" <> "translationLanguage"),
        CONSTRAINT ck_podcast_topics_levels CHECK (
          "minimumLevel" IN ('A1','A2','B1','B2','C1')
          AND "maximumLevel" IN ('A1','A2','B1','B2','C1')
        ),
        CONSTRAINT ck_podcast_topics_status CHECK (status IN ('draft','published','archived'))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS podcast_episodes (
        id varchar PRIMARY KEY,
        "topicId" varchar NOT NULL,
        "externalId" varchar(120) NOT NULL,
        title varchar(160) NOT NULL,
        "titleTranslation" varchar(160) NOT NULL DEFAULT '',
        description text NOT NULL DEFAULT '',
        level varchar(4) NOT NULL,
        position integer NOT NULL,
        status varchar(30) NOT NULL DEFAULT 'draft',
        "thumbnailAssetId" varchar NULL,
        "audioUrl" varchar(1000) NULL,
        "audioStoragePath" varchar(500) NULL,
        "audioDurationMs" integer NOT NULL DEFAULT 0,
        "contentVersion" integer NOT NULL DEFAULT 1,
        "audioVersion" integer NOT NULL DEFAULT 0,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "publishedAt" timestamptz NULL,
        CONSTRAINT uq_podcast_episodes_external_id UNIQUE ("externalId"),
        CONSTRAINT uq_podcast_episodes_topic_position UNIQUE ("topicId", position),
        CONSTRAINT fk_podcast_episodes_topic FOREIGN KEY ("topicId") REFERENCES podcast_topics(id) ON DELETE CASCADE,
        CONSTRAINT fk_podcast_episodes_thumbnail FOREIGN KEY ("thumbnailAssetId") REFERENCES podcast_thumbnail_assets(id) ON DELETE SET NULL,
        CONSTRAINT ck_podcast_episodes_level CHECK (level IN ('A1','A2','B1','B2','C1')),
        CONSTRAINT ck_podcast_episodes_position CHECK (position >= 0),
        CONSTRAINT ck_podcast_episodes_duration CHECK ("audioDurationMs" >= 0 AND "audioDurationMs" <= 300000),
        CONSTRAINT ck_podcast_episodes_status CHECK (
          status IN ('draft','validating','queued','generating','ready_for_review','published','failed','archived')
        )
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_podcast_topics_status ON podcast_topics (status)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_podcast_episodes_topic ON podcast_episodes ("topicId")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS podcast_episodes');
    await queryRunner.query('DROP TABLE IF EXISTS podcast_topics');
    await queryRunner.query('DROP TABLE IF EXISTS podcast_thumbnail_assets');
  }
}
