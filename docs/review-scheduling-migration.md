# Review scheduling migration

This migration moves scheduling state from `cards` into the one-to-one
`review_scheduling` table and creates the immutable `review_commits` and
`card_administration_events` tables with their required indexes when they do
not already exist.

Run it before deploying the application version that removes the legacy card
columns. Stop API writers or put the API into maintenance mode while it runs.
Do not start the new API build or enable `TYPEORM_SYNCHRONIZE` before running
the migration.

```bash
DATABASE_URL='postgresql://...' npm run migrate:review-scheduling
```

The command compiles the API first and then runs the generated migration
artifact, so the server does not need `ts-node` or an on-demand package download.

The command is safe to rehearse against the local database and reuse against
the hosted PostgreSQL database. It runs in one transaction, takes an advisory
lock, converts legacy `NULL` state to explicit New state, rejects conflicting
scheduling state, verifies one scheduling row per card, and only then removes
`cards.reviewState` and `cards.reviewStateUpdatedAt`.

Legacy cards with a `NULL` review state are treated as never-reviewed cards and
receive an explicit New scheduling state. Existing non-null states are preserved
and still validated before the legacy columns are removed.

Create a database backup before the hosted run. If any validation fails, the
transaction rolls back without dropping the legacy columns. A successful rerun
prints `Verified` and makes no schema changes.

On Render's free plan, the Blueprint start command runs the compiled migration
before starting NestJS because pre-deploy commands are unavailable. The
migration is idempotent: subsequent service restarts verify the schema and then
continue to API startup.
