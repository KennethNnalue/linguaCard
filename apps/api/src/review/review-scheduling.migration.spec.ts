import { migrateReviewScheduling, ReviewSchedulingMigrationRunner } from './review-scheduling.migration';
import { describe, expect, jest, test } from '@jest/globals';

type QueryMock = jest.MockedFunction<ReviewSchedulingMigrationRunner['query']>;

interface MigrationRunnerFixture extends ReviewSchedulingMigrationRunner {
  query: QueryMock;
  commitTransaction: jest.MockedFunction<ReviewSchedulingMigrationRunner['commitTransaction']>;
  rollbackTransaction: jest.MockedFunction<ReviewSchedulingMigrationRunner['rollbackTransaction']>;
  release: jest.MockedFunction<ReviewSchedulingMigrationRunner['release']>;
}

function count(value: number): Array<{ count: number }> {
  return [{ count: value }];
}

function runnerWithCounts(values: readonly number[]): MigrationRunnerFixture {
  const responses = [...values];
  const query: QueryMock = jest.fn(async (sql: string, parameters?: readonly unknown[]) => {
    void parameters;
    if (sql.includes('pg_advisory_xact_lock') || sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX') || sql.includes('CREATE UNIQUE INDEX') || sql.includes('INSERT INTO') || sql.includes('UPDATE "cards"') || sql.includes('ALTER TABLE')) {
      return [];
    }
    const value = responses.shift();
    if (value === undefined) throw new Error('Missing query fixture result');
    return count(value);
  });
  return {
    connect: jest.fn<ReviewSchedulingMigrationRunner['connect']>(async () => undefined),
    startTransaction: jest.fn<ReviewSchedulingMigrationRunner['startTransaction']>(async () => undefined),
    query,
    commitTransaction: jest.fn<ReviewSchedulingMigrationRunner['commitTransaction']>(async () => undefined),
    rollbackTransaction: jest.fn<ReviewSchedulingMigrationRunner['rollbackTransaction']>(async () => undefined),
    release: jest.fn<ReviewSchedulingMigrationRunner['release']>(async () => undefined),
  };
}

describe('review scheduling migration', () => {
  test('copies valid legacy states, verifies cardinality, and drops legacy columns', async () => {
    const runner = runnerWithCounts([1, 0, 0, 0, 2, 2, 0, 0]);

    await expect(migrateReviewScheduling(runner)).resolves.toEqual({
      cards: 2,
      schedulingRows: 2,
      explicitNewStatesCreated: 0,
      migrated: true,
    });
    expect(runner.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO "review_scheduling"'));
    expect(runner.query).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS "review_commits"'));
    expect(runner.query).toHaveBeenCalledWith(expect.stringContaining('idx_review_commits_userId_reviewedAt'));
    expect(runner.query).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS "card_administration_events"'));
    expect(runner.query).toHaveBeenCalledWith(expect.stringContaining('DROP COLUMN "reviewState"'));
    expect(runner.commitTransaction).toHaveBeenCalledWith();
    expect(runner.rollbackTransaction).not.toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalledWith();
  });

  test('reruns as verification only after the legacy columns are gone', async () => {
    const runner = runnerWithCounts([0, 2, 2, 0, 0]);

    await expect(migrateReviewScheduling(runner)).resolves.toEqual({
      cards: 2,
      schedulingRows: 2,
      explicitNewStatesCreated: 0,
      migrated: false,
    });
    expect(runner.query).not.toHaveBeenCalledWith(expect.stringContaining('DROP COLUMN'));
    expect(runner.commitTransaction).toHaveBeenCalledWith();
  });

  test('converts legacy implicit-new cards into explicit scheduling states', async () => {
    const runner = runnerWithCounts([1, 1, 0, 0, 2, 2, 0, 0]);

    await expect(migrateReviewScheduling(runner)).resolves.toEqual({
      cards: 2,
      schedulingRows: 2,
      explicitNewStatesCreated: 1,
      migrated: true,
    });
    expect(runner.query).toHaveBeenCalledWith(expect.stringContaining('jsonb_build_object'));
    expect(runner.commitTransaction).toHaveBeenCalledWith();
  });
});
