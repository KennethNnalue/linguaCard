import 'reflect-metadata';
import { ConfigModule } from '@nestjs/config';
import { createServer, type Server } from 'node:http';
import { DataSource, type DataSourceOptions } from 'typeorm';
import databaseConfig from '../config/database.config';

function openDeploymentPort(): Promise<Server | null> {
  const rawPort = process.env['PORT'];
  if (!rawPort) return Promise.resolve(null);
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1) throw new Error(`Invalid PORT value: ${rawPort}`);

  const server = createServer((request, response) => {
    if (request.url === '/api/v1/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'migrating' }));
      return;
    }
    response.writeHead(503, { 'content-type': 'application/json', 'retry-after': '10' });
    response.end(JSON.stringify({ status: 'migrating' }));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      console.log(`Migration readiness server listening on port ${port}.`);
      resolve(server);
    });
  });
}

function closeDeploymentPort(server: Server | null): Promise<void> {
  if (!server) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

async function runDatabaseMigrations(): Promise<void> {
  ConfigModule.forRoot({
    envFilePath: ['apps/api/.env', '.env', '../../.env'],
  });
  const deploymentServer = await openDeploymentPort();
  const options = databaseConfig();
  const dataSource = new DataSource({
    ...options,
    migrationsRun: false,
  } as DataSourceOptions);

  try {
    await dataSource.initialize();
    const baseline: Array<{ hasUsers: boolean; applicationTableCount: number }> = await dataSource.query(`
      SELECT
        to_regclass('public.users') IS NOT NULL AS "hasUsers",
        COUNT(*) FILTER (WHERE table_name <> 'migrations')::int AS "applicationTableCount"
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    if (!baseline[0]?.hasUsers) {
      if ((baseline[0]?.applicationTableCount ?? 0) > 0) {
        throw new Error('Database baseline is incomplete: users table is missing from a non-empty schema. Restore the database or run the legacy baseline migration before continuing.');
      }
      // This project predates TypeORM migrations for its original tables. Schema
      // synchronization is safe only for a completely empty database bootstrap.
      await dataSource.synchronize(false);
    }
    const migrations = await dataSource.runMigrations({ transaction: 'all' });
    console.log(`Database migrations complete: ${migrations.length} applied.`);
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
    await closeDeploymentPort(deploymentServer);
  }
}

runDatabaseMigrations().catch((error: unknown) => {
  console.error('Database migration failed.', error);
  process.exitCode = 1;
});
