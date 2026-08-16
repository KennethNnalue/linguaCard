import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { CreateEngagementTables1760000000000 } from '../engagement/migration/CreateEngagementTables';

dotenv.config();

const ENGAGEMENT_MIGRATION_LOCK_ID = 7_314_209_002;

async function run(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : false,
    entities: [],
    synchronize: false,
  });
  await dataSource.initialize();
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.query('SELECT pg_advisory_xact_lock($1)', [ENGAGEMENT_MIGRATION_LOCK_ID]);
    await new CreateEngagementTables1760000000000().up(queryRunner);
    await queryRunner.commitTransaction();
    console.log('Created or verified engagement tables.');
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

void run().catch(error => {
  if (error instanceof AggregateError) {
    const details = error.errors
      .map(candidate => candidate instanceof Error ? candidate.message : String(candidate))
      .filter(message => message.length > 0)
      .join('; ');
    console.error(details || 'Engagement migration failed');
  } else {
    console.error(error instanceof Error && error.message ? error.message : 'Engagement migration failed');
  }
  process.exitCode = 1;
});
