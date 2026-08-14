const MIGRATION_LOCK_ID = 7_314_209_001;

export interface ReviewSchedulingMigrationRunner {
  connect(): Promise<unknown>;
  startTransaction(): Promise<unknown>;
  query(sql: string, parameters?: readonly unknown[]): Promise<unknown>;
  commitTransaction(): Promise<unknown>;
  rollbackTransaction(): Promise<unknown>;
  release(): Promise<unknown>;
}

export interface ReviewSchedulingMigrationResult {
  cards: number;
  schedulingRows: number;
  explicitNewStatesCreated: number;
  migrated: boolean;
}

function countFrom(result: unknown): number {
  if (!Array.isArray(result) || result.length !== 1) throw new Error('Unexpected migration count result');
  const row: unknown = result[0];
  if (typeof row !== 'object' || row === null || !('count' in row)) throw new Error('Migration count is unavailable');
  const count = Number(row.count);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Migration count is invalid');
  return count;
}

async function count(queryRunner: ReviewSchedulingMigrationRunner, sql: string): Promise<number> {
  return countFrom(await queryRunner.query(sql));
}

export async function migrateReviewScheduling(queryRunner: ReviewSchedulingMigrationRunner): Promise<ReviewSchedulingMigrationResult> {
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_ID]);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "review_scheduling" (
        "cardId" varchar PRIMARY KEY,
        "state" jsonb NOT NULL,
        "stateUpdatedAt" timestamptz NULL,
        CONSTRAINT "fk_review_scheduling_card"
          FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "review_commits" (
        "eventId" varchar PRIMARY KEY,
        "attemptId" varchar NOT NULL,
        "userId" varchar NOT NULL,
        "cardId" varchar NOT NULL,
        "reviewId" varchar NOT NULL,
        "sessionId" varchar NOT NULL,
        "reviewedAt" timestamptz NOT NULL,
        "event" jsonb NOT NULL,
        "record" jsonb NOT NULL,
        "nextState" jsonb NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS "uq_review_commits_attemptId" ON "review_commits" ("attemptId")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_review_commits_userId" ON "review_commits" ("userId")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_review_commits_cardId" ON "review_commits" ("cardId")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_review_commits_userId_reviewedAt" ON "review_commits" ("userId", "reviewedAt")');
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "card_administration_events" (
        "eventId" varchar PRIMARY KEY,
        "commandId" varchar NOT NULL,
        "userId" varchar NOT NULL,
        "cardId" varchar NOT NULL,
        "type" varchar NOT NULL,
        "occurredAt" timestamptz NOT NULL,
        "event" jsonb NOT NULL,
        "nextState" jsonb NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS "uq_card_administration_events_commandId" ON "card_administration_events" ("commandId")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_card_administration_events_userId" ON "card_administration_events" ("userId")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_card_administration_events_cardId" ON "card_administration_events" ("cardId")');

    const legacyColumnCount = await count(queryRunner, `
      SELECT COUNT(*)::int AS count
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'cards'
        AND column_name = 'reviewState'
    `);
    const hasLegacyColumns = legacyColumnCount === 1;
    let explicitNewStatesCreated = 0;

    if (hasLegacyColumns) {
      explicitNewStatesCreated = await count(queryRunner, `
        SELECT COUNT(*)::int AS count FROM "cards" WHERE "reviewState" IS NULL
      `);
      if (explicitNewStatesCreated > 0) {
        await queryRunner.query(`
          UPDATE "cards"
          SET "reviewState" = jsonb_build_object(
            'cardId', "id",
            'stage', 'new',
            'problemStatus', 'normal',
            'totalReviewCount', 0,
            'totalAgainCount', 0,
            'recentRatings', '[]'::jsonb,
            'successfulReviewsSinceLastAgain', 0
          )
          WHERE "reviewState" IS NULL
        `);
      }

      const mismatchedLegacyIds = await count(queryRunner, `
        SELECT COUNT(*)::int AS count
        FROM "cards"
        WHERE "reviewState"->>'cardId' IS DISTINCT FROM "id"
      `);
      if (mismatchedLegacyIds > 0) {
        throw new Error(`Migration aborted: ${mismatchedLegacyIds} scheduling states reference the wrong card`);
      }

      await queryRunner.query(`
        INSERT INTO "review_scheduling" ("cardId", "state", "stateUpdatedAt")
        SELECT "id", "reviewState", "reviewStateUpdatedAt"
        FROM "cards"
        ON CONFLICT ("cardId") DO NOTHING
      `);

      const conflictingRows = await count(queryRunner, `
        SELECT COUNT(*)::int AS count
        FROM "cards" card
        INNER JOIN "review_scheduling" scheduling ON scheduling."cardId" = card."id"
        WHERE scheduling."state" IS DISTINCT FROM card."reviewState"
           OR scheduling."stateUpdatedAt" IS DISTINCT FROM card."reviewStateUpdatedAt"
      `);
      if (conflictingRows > 0) {
        throw new Error(`Migration aborted: ${conflictingRows} existing scheduling rows conflict with card data`);
      }
    } else {
      explicitNewStatesCreated = await count(queryRunner, `
        SELECT COUNT(*)::int AS count
        FROM "cards" card
        LEFT JOIN "review_scheduling" scheduling ON scheduling."cardId" = card."id"
        WHERE scheduling."cardId" IS NULL
      `);
      if (explicitNewStatesCreated > 0) {
        await queryRunner.query(`
          INSERT INTO "review_scheduling" ("cardId", "state", "stateUpdatedAt")
          SELECT card."id", jsonb_build_object(
            'cardId', card."id",
            'stage', 'new',
            'problemStatus', 'normal',
            'totalReviewCount', 0,
            'totalAgainCount', 0,
            'recentRatings', '[]'::jsonb,
            'successfulReviewsSinceLastAgain', 0
          ), NULL
          FROM "cards" card
          LEFT JOIN "review_scheduling" scheduling ON scheduling."cardId" = card."id"
          WHERE scheduling."cardId" IS NULL
          ON CONFLICT ("cardId") DO NOTHING
        `);
      }
    }

    const cards = await count(queryRunner, 'SELECT COUNT(*)::int AS count FROM "cards"');
    const schedulingRows = await count(queryRunner, 'SELECT COUNT(*)::int AS count FROM "review_scheduling"');
    const cardsWithoutScheduling = await count(queryRunner, `
      SELECT COUNT(*)::int AS count
      FROM "cards" card
      LEFT JOIN "review_scheduling" scheduling ON scheduling."cardId" = card."id"
      WHERE scheduling."cardId" IS NULL
    `);
    const orphanedScheduling = await count(queryRunner, `
      SELECT COUNT(*)::int AS count
      FROM "review_scheduling" scheduling
      LEFT JOIN "cards" card ON card."id" = scheduling."cardId"
      WHERE card."id" IS NULL
    `);
    if (cardsWithoutScheduling > 0 || orphanedScheduling > 0 || cards !== schedulingRows) {
      throw new Error(
        `Migration aborted: cards=${cards}, scheduling=${schedulingRows}, missing=${cardsWithoutScheduling}, orphaned=${orphanedScheduling}`,
      );
    }

    if (hasLegacyColumns) {
      await queryRunner.query(`
        ALTER TABLE "cards"
          DROP COLUMN "reviewStateUpdatedAt",
          DROP COLUMN "reviewState"
      `);
    }
    await queryRunner.commitTransaction();
    return {
      cards,
      schedulingRows,
      explicitNewStatesCreated,
      migrated: hasLegacyColumns || explicitNewStatesCreated > 0,
    };
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}
