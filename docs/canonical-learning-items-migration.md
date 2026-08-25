# Canonical learning-item migration

The production backfill is deliberately separate from API startup. Render applies only bounded schema migrations; this job is run from a trusted workstation against a direct Neon connection.

## Test branch

1. Create a Neon child branch from production.
2. Build the API:

   ```bash
   npm install
   npm run build:api
   ```

3. Export the child branch's direct connection string without committing it:

   ```bash
   export DATABASE_URL='<direct Neon connection string>'
   export NODE_ENV=production
   unset PORT
   ```

4. Apply bounded schema migrations, then run the resumable data job:

   ```bash
   npm run migrate:database
   npm run backfill:canonical-learning-items
   npm run validate:canonical-learning-items
   ```

The job checkpoints four phases in `data_migration_jobs`: `dictionary`, `audio`, `linked_cards`, and `unlinked_cards`. Rerunning the command resumes from the last committed cursor. A successful validation writes `canonical-learning-items-v2` to `data_migration_markers`.

## Production

1. Keep the rolled-back application running.
2. Create a fresh Neon backup branch from production.
3. Prevent card and collection writes for the maintenance window.
4. Repeat the commands above with the production direct connection string.
5. Verify the completion marker:

   ```sql
   SELECT * FROM data_migration_markers
   WHERE key = 'canonical-learning-items-v2';
   ```

6. Deploy the canonical application and smoke-test login, Vault totals, collection membership, search, and review state before restoring writes.

Never run this job concurrently. It uses a PostgreSQL advisory lock and exits if another copy is active.
