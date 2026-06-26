/**
 * One-time migration: normalise user emails to lowercase + enforce a
 * case-insensitive unique index.
 *
 * Background: registration historically stored emails verbatim, while lookups
 * (login, share recipient) were inconsistent about casing. The app now does
 * case-insensitive lookups, but normalising the stored data lets us drop that
 * workaround in favour of a plain indexed lookup.
 *
 * Safety: if two accounts differ only by email casing (e.g. "A@x.com" and
 * "a@x.com"), lowercasing would violate uniqueness. The script DETECTS these,
 * prints them, and aborts WITHOUT mutating anything — merging accounts is a
 * manual decision, not something to automate.
 *
 * Idempotent — safe to run repeatedly. Rows already lowercase are untouched,
 * and the index is created with IF NOT EXISTS.
 *
 * Usage: npx ts-node -r tsconfig-paths/register apps/api/src/scripts/normalize-user-emails.ts
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';

interface CollisionRow {
  lowered: string;
  count: string; // postgres COUNT() comes back as a string
}

async function migrate(dataSource: DataSource): Promise<void> {
  // 1. Detect case-only duplicates that would break the unique index.
  const collisions: CollisionRow[] = await dataSource.query(`
    SELECT LOWER(email) AS lowered, COUNT(*) AS count
    FROM users
    GROUP BY LOWER(email)
    HAVING COUNT(*) > 1
  `);

  if (collisions.length > 0) {
    console.error(
      `\n✗ Aborting: ${collisions.length} email(s) have case-only duplicate accounts.\n` +
      `  Resolve these manually (merge or delete) before re-running:\n`,
    );
    for (const c of collisions) {
      const rows: Array<{ id: string; email: string }> = await dataSource.query(
        'SELECT id, email FROM users WHERE LOWER(email) = $1 ORDER BY email',
        [c.lowered],
      );
      console.error(`  • ${c.lowered} (${c.count} accounts):`);
      for (const r of rows) console.error(`      ${r.id}  ${r.email}`);
    }
    console.error('');
    throw new Error('Email case collisions must be resolved manually.');
  }

  // 2. Lowercase any rows that aren't already normalised.
  const updateResult = await dataSource.query(
    `UPDATE users SET email = LOWER(email) WHERE email <> LOWER(email)`,
  );
  // node-postgres returns affected count differently per driver version; log defensively.
  const affected = Array.isArray(updateResult) ? updateResult[1] : updateResult?.affected;
  console.log(`Normalised ${affected ?? 0} email(s) to lowercase.`);

  // 3. Enforce case-insensitive uniqueness going forward.
  await dataSource.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email))`,
  );
  console.log('Ensured unique index idx_users_email_lower on LOWER(email).');
}

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env['DATABASE_URL'],
  ssl: process.env['NODE_ENV'] === 'production'
    ? { rejectUnauthorized: false }
    : false,
  synchronize: false,
});

dataSource
  .initialize()
  .then(() => migrate(dataSource))
  .then(() => console.log('✓ Email normalisation complete.'))
  .catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => dataSource.destroy());
