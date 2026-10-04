import type { MigrationInterface, QueryRunner } from 'typeorm';
export class AddPodcastRecommendationAssignments1787460000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS podcast_recommendation_assignments (
      id varchar PRIMARY KEY, "userId" varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "experimentVersion" varchar NOT NULL, cohort varchar NOT NULL CHECK (cohort IN ('treatment','control')),
      "createdAt" timestamptz NOT NULL DEFAULT now(), UNIQUE ("userId","experimentVersion"))`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS podcast_recommendation_assignments');
  }
}
