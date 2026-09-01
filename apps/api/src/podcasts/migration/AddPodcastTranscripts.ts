import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPodcastTranscripts1787443000000 implements MigrationInterface {
  name = 'AddPodcastTranscripts1787443000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE podcast_episodes ADD COLUMN IF NOT EXISTS "transcriptFingerprint" varchar(64) NULL');
    await queryRunner.query('ALTER TABLE podcast_episodes ADD COLUMN IF NOT EXISTS "estimatedDurationMs" integer NOT NULL DEFAULT 0');
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS podcast_speakers (
        id varchar PRIMARY KEY, "episodeId" varchar NOT NULL, "speakerKey" varchar(60) NOT NULL,
        "displayName" varchar(100) NOT NULL, "voiceId" varchar(200) NOT NULL, position integer NOT NULL,
        CONSTRAINT uq_podcast_speakers_episode_key UNIQUE ("episodeId", "speakerKey"),
        CONSTRAINT fk_podcast_speakers_episode FOREIGN KEY ("episodeId") REFERENCES podcast_episodes(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS podcast_turns (
        id varchar PRIMARY KEY, "episodeId" varchar NOT NULL, "speakerId" varchar NOT NULL,
        position integer NOT NULL, "targetText" text NOT NULL, translation text NOT NULL,
        "vocabularyKeys" jsonb NOT NULL DEFAULT '[]', "wordTimings" jsonb NOT NULL DEFAULT '[]',
        CONSTRAINT uq_podcast_turns_episode_position UNIQUE ("episodeId", position),
        CONSTRAINT fk_podcast_turns_episode FOREIGN KEY ("episodeId") REFERENCES podcast_episodes(id) ON DELETE CASCADE,
        CONSTRAINT fk_podcast_turns_speaker FOREIGN KEY ("speakerId") REFERENCES podcast_speakers(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS podcast_episode_vocabulary (
        id varchar PRIMARY KEY, "episodeId" varchar NOT NULL, "lexemeId" varchar NOT NULL,
        "vocabularyKey" varchar(60) NOT NULL, position integer NOT NULL, importance varchar(20) NOT NULL,
        CONSTRAINT uq_podcast_episode_vocabulary_key UNIQUE ("episodeId", "vocabularyKey"),
        CONSTRAINT uq_podcast_episode_vocabulary_lexeme UNIQUE ("episodeId", "lexemeId"),
        CONSTRAINT fk_podcast_episode_vocabulary_episode FOREIGN KEY ("episodeId") REFERENCES podcast_episodes(id) ON DELETE CASCADE,
        CONSTRAINT fk_podcast_episode_vocabulary_lexeme FOREIGN KEY ("lexemeId") REFERENCES lexemes(id),
        CONSTRAINT ck_podcast_episode_vocabulary_importance CHECK (importance IN ('essential','supporting'))
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_podcast_turns_episode ON podcast_turns ("episodeId")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_podcast_episode_vocabulary_episode ON podcast_episode_vocabulary ("episodeId")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS podcast_episode_vocabulary');
    await queryRunner.query('DROP TABLE IF EXISTS podcast_turns');
    await queryRunner.query('DROP TABLE IF EXISTS podcast_speakers');
    await queryRunner.query('ALTER TABLE podcast_episodes DROP COLUMN IF EXISTS "estimatedDurationMs"');
    await queryRunner.query('ALTER TABLE podcast_episodes DROP COLUMN IF EXISTS "transcriptFingerprint"');
  }
}
