import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillPlatformStoryKeywordIds1787447000000 implements MigrationInterface {
  name = 'BackfillPlatformStoryKeywordIds1787447000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE platform_stories AS story
      SET keywords = (
        SELECT COALESCE(
          jsonb_agg(
            CASE
              WHEN keyword.value ? 'wordId' AND keyword.value->>'wordId' <> ''
                THEN keyword.value
              ELSE keyword.value || jsonb_build_object(
                'wordId',
                story.id || ':keyword:' || (keyword.ordinality - 1)::text
              )
            END
            ORDER BY keyword.ordinality
          ),
          '[]'::jsonb
        )
        FROM jsonb_array_elements(COALESCE(story.keywords, '[]'::jsonb))
          WITH ORDINALITY AS keyword(value, ordinality)
      )
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(story.keywords, '[]'::jsonb)) AS item
        WHERE NOT (item ? 'wordId') OR item->>'wordId' = ''
      )
    `);
  }

  async down(): Promise<void> {
    return;
  }
}
