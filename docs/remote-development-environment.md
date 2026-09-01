# Remote development environment

The remote development environment mirrors the production request path while
keeping development state separate:

```text
Angular development client
  -> https://linguacard-api-dev.onrender.com/api/v1
  -> linguacard-api-dev
  -> linguacard-db-dev
```

Production continues to use `linguacard-api` and its existing database. Never
point `linguacard-api-dev` at the production `DATABASE_URL`.

## Provision on Render

1. Sync the repository's `render.yaml` Blueprint in Render.
2. Confirm Render will create only `linguacard-api-dev` and
   `linguacard-db-dev`; the existing `linguacard-api` remains the production
   service.
3. Supply a new development-only `JWT_SECRET` when Render prompts for secrets.
4. Add development API credentials only for features the team needs to test.
   Secret values are intentionally not stored in Git.
5. If audio/object storage is required, create a separate R2 bucket and set the
   dev service's `R2_*` variables to that bucket. Do not reuse the production
   bucket.
6. Wait for `/api/v1/health` to return `{ "status": "ok" }`.

The first API startup creates the schema in the empty dev database and applies
all TypeORM migrations. Platform starter content is idempotently seeded. User
accounts and user-owned production records are not copied.

Render free Postgres instances are suitable for disposable development data,
but their retention and availability limits should be checked before relying on
them for long-lived shared data. Select a persistent paid plan in `render.yaml`
if the team needs durable development state.

## Run the client against the hosted API

```bash
npm run start:remote-dev
```

This serves the Angular app locally with the `remote-development` configuration.
Normal `npm start` still uses the locally running API at port 3001.

To make a distributable development build:

```bash
npm run build:remote-dev
```

## CORS and hosted development clients

The Blueprint initially permits `http://localhost:4200` and
`http://localhost:8100`. If a development client is also deployed to Vercel,
add its exact HTTPS origin to the `CORS_ORIGIN` value for
`linguacard-api-dev`, separated by a comma, then redeploy the API.

## Production web builds

Vercel runs `npm run build:web`. Set its `API_URL` to the API origin without
`/api/v1`, for example `https://linguacard-api.onrender.com`. The build helper
normalizes the trailing slash and appends `/api/v1`.

## Smoke test

```bash
curl --fail https://linguacard-api-dev.onrender.com/api/v1/health
npm run start:remote-dev
```

Then register a development account and verify that its data appears only in
`linguacard-db-dev`.
