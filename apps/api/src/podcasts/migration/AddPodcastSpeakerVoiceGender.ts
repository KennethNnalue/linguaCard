import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPodcastSpeakerVoiceGender1787446000000 implements MigrationInterface {
  name = 'AddPodcastSpeakerVoiceGender1787446000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE podcast_speakers ADD COLUMN IF NOT EXISTS "voiceGender" varchar(10)`,
    );
    await queryRunner.query(
      `UPDATE podcast_speakers SET "voiceGender" = CASE WHEN position % 2 = 0 THEN 'female' ELSE 'male' END WHERE "voiceGender" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE podcast_speakers ALTER COLUMN "voiceGender" SET NOT NULL`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'ck_podcast_speaker_voice_gender'
        ) THEN
          ALTER TABLE podcast_speakers ADD CONSTRAINT ck_podcast_speaker_voice_gender
            CHECK ("voiceGender" IN ('female', 'male'));
        END IF;
      END
      $$
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE podcast_speakers DROP CONSTRAINT IF EXISTS ck_podcast_speaker_voice_gender',
    );
    await queryRunner.query('ALTER TABLE podcast_speakers DROP COLUMN IF EXISTS "voiceGender"');
  }
}
