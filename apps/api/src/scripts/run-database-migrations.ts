import 'reflect-metadata';
import { ConfigModule } from '@nestjs/config';
import { DataSource, type DataSourceOptions } from 'typeorm';
import databaseConfig from '../config/database.config';

async function runDatabaseMigrations(): Promise<void> {
  ConfigModule.forRoot({
    envFilePath: ['apps/api/.env', '.env', '../../.env'],
  });
  const options = databaseConfig();
  const dataSource = new DataSource({
    ...options,
    migrationsRun: false,
  } as DataSourceOptions);

  await dataSource.initialize();
  try {
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
    await dataSource.destroy();
  }
}

runDatabaseMigrations().catch((error: unknown) => {
  console.error('Database migration failed.', error);
  process.exitCode = 1;
});
