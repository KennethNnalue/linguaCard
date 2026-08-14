import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { migrateReviewScheduling } from '../review/review-scheduling.migration';

dotenv.config();

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
  try {
    const result = await migrateReviewScheduling(dataSource.createQueryRunner());
    const action = result.migrated ? 'Migrated' : 'Verified';
    console.log(`${action} ${result.schedulingRows} scheduling rows for ${result.cards} cards; created ${result.explicitNewStatesCreated} explicit New states.`);
  } finally {
    await dataSource.destroy();
  }
}

void run().catch(error => {
  console.error(error instanceof Error ? error.message : 'Review scheduling migration failed');
  process.exitCode = 1;
});
