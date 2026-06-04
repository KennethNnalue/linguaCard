/**
 * LC-130 backfill — adds plural: null and synonyms: [] to every card row
 * whose content JSONB is missing either field.
 *
 * Run from the repo root:
 *   DATABASE_URL=... npx ts-node -r tsconfig-paths/register \
 *     apps/api/src/import/migration/backfill-plural-synonyms.ts [--dry-run]
 *
 * Idempotent — only touches rows where plural or synonyms keys are absent.
 * Never overwrites a row that already has both fields populated.
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 500;

async function createDataSource(): Promise<DataSource> {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }
  const ds = new DataSource({ type: 'postgres', url, synchronize: false });
  await ds.initialize();
  return ds;
}

async function run(): Promise<void> {
  console.log(DRY_RUN ? '🔍 DRY RUN — no changes will be made\n' : '🚀 Running backfill\n');

  const ds = await createDataSource();
  const qr = ds.createQueryRunner();

  try {
    // Count affected rows first so we can report progress
    const [{ count }] = await qr.query(`
      SELECT COUNT(*) AS count
      FROM cards
      WHERE content->>'plural'   IS NULL
         OR content->>'synonyms' IS NULL
    `) as [{ count: string }];

    const total = parseInt(count, 10);
    console.log(`Cards needing backfill: ${total}\n`);

    if (total === 0) {
      console.log('Nothing to do — all rows already have both fields.');
      return;
    }

    if (DRY_RUN) {
      console.log(`Would update ${total} rows.`);
      return;
    }

    // Process in batches to avoid locking the table for too long.
    // The JSONB || operator merges only the missing keys — existing values
    // (including any real plural/synonyms already set) are preserved because
    // we only update rows where at least one field is absent.
    let updated = 0;
    while (updated < total) {
      const result = await qr.query(`
        WITH batch AS (
          SELECT id FROM cards
          WHERE content->>'plural'   IS NULL
             OR content->>'synonyms' IS NULL
          LIMIT $1
        )
        UPDATE cards
        SET content = content
          || CASE WHEN content->>'plural'   IS NULL THEN '{"plural": null}'::jsonb   ELSE '{}'::jsonb END
          || CASE WHEN content->>'synonyms' IS NULL THEN '{"synonyms": []}'::jsonb   ELSE '{}'::jsonb END
        WHERE id IN (SELECT id FROM batch)
        RETURNING id
      `, [BATCH_SIZE]) as { id: string }[];

      const batchCount = result.length;
      if (batchCount === 0) break;
      updated += batchCount;
      console.log(`  Updated ${updated} / ${total}`);
    }

    console.log(`\n✅ Backfill complete — ${updated} rows updated.`);
  } finally {
    await qr.release();
    await ds.destroy();
  }
}

run().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
