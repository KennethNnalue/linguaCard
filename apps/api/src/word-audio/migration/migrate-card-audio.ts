/**
 * LC-WA12 · Data migration: existing card audio → word_audio registry
 *
 * Migrates files stored under pronunciation/{cardId}.wav in R2 into the
 * global word_audio registry at word-audio/{hash}.wav.
 *
 * Run from the repo root:
 *   npx ts-node -r tsconfig-paths/register \
 *     apps/api/src/word-audio/migration/migrate-card-audio.ts [--dry-run]
 *
 * Idempotent — safe to run multiple times. Existing word_audio rows are skipped.
 * Old R2 files are NOT deleted here — run cleanup-r2.ts after verifying migration.
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { normalizeForAudio, audioStorageHash } from '../normalize';
import { WordAudioEntity } from '../word-audio.entity';
import { CardEntity } from '../../cards/card.entity';

const DRY_RUN = process.argv.includes('--dry-run');

// ─── DB connection ────────────────────────────────────────────────────────────

async function createDataSource(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'postgres',
    url: process.env['DATABASE_URL'],
    entities: [WordAudioEntity, CardEntity],
    synchronize: false,
  });
  await ds.initialize();
  return ds;
}

// ─── R2 client ────────────────────────────────────────────────────────────────

function createS3(): S3Client {
  const accountId = process.env['R2_ACCOUNT_ID'] ?? '';
  const accessKeyId = process.env['R2_ACCESS_KEY_ID'] ?? '';
  const secretAccessKey = process.env['R2_SECRET_ACCESS_KEY'] ?? '';
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function listAllObjects(s3: S3Client, bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const resp: ListObjectsV2CommandOutput = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    for (const obj of resp.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    continuationToken = resp.NextContinuationToken;
  } while (continuationToken);
  return keys;
}

async function copyObject(
  s3: S3Client,
  bucket: string,
  sourceKey: string,
  destKey: string,
): Promise<void> {
  // Get the source object
  const getResp = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: sourceKey }));
  const chunks: Uint8Array[] = [];
  for await (const chunk of getResp.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);

  // Upload to destination
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: destKey,
    Body: body,
    ContentType: 'audio/wav',
  }));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  console.log(DRY_RUN ? '🔍 DRY RUN — no changes will be made\n' : '🚀 Running migration\n');

  const bucket = process.env['R2_BUCKET'] ?? '';
  const publicBaseUrl = (process.env['R2_PUBLIC_URL'] ?? '').replace(/\/$/, '');

  if (!bucket || !publicBaseUrl) {
    console.error('R2_BUCKET and R2_PUBLIC_URL must be set');
    process.exit(1);
  }

  const ds = await createDataSource();
  const s3 = createS3();

  const cardRepo = ds.getRepository(CardEntity);
  const wordAudioRepo = ds.getRepository(WordAudioEntity);

  // 1. List all pronunciation/{cardId}.wav files in R2
  console.log('Listing pronunciation/ objects in R2…');
  const keys = await listAllObjects(s3, bucket, 'pronunciation/');
  console.log(`Found ${keys.length} files under pronunciation/\n`);

  let registered = 0;
  let skipped = 0;
  let noCard = 0;
  let errors = 0;

  for (const key of keys) {
    // Key format: pronunciation/{cardId}.wav
    const cardId = key.replace('pronunciation/', '').replace('.wav', '');

    let card: CardEntity | null;
    try {
      card = await cardRepo.findOne({ where: { id: cardId } });
    } catch {
      console.warn(`  ⚠ DB error looking up card ${cardId}`);
      errors++;
      continue;
    }

    if (!card) {
      console.log(`  ⏭ No card found for ${key} — skipping`);
      noCard++;
      continue;
    }

    const text = (card.content.article ? `${card.content.article} ` : '') + card.content.back;
    const language = 'de-DE';
    const normalizedText = normalizeForAudio(text, language);
    const hash = audioStorageHash(normalizedText, language);
    const storagePath = `word-audio/${hash}.wav`;
    const audioUrl = `${publicBaseUrl}/${storagePath}`;

    // Check if word_audio row already exists
    const existing = await wordAudioRepo.findOne({
      where: { normalizedText, language },
    });

    if (existing) {
      console.log(`  ✓ Already registered: "${text}" (${normalizedText})`);
      skipped++;
      continue;
    }

    console.log(`  → Register "${text}" | ${key} → ${storagePath}`);

    if (!DRY_RUN) {
      try {
        await copyObject(s3, bucket, key, storagePath);

        const entity = wordAudioRepo.create({
          id: randomUUID(),
          normalizedText,
          displayText: text,
          language,
          audioUrl,
          storagePath,
          durationMs: 0,
          status: 'ready',
          failedAt: null,
        });
        await wordAudioRepo.save(entity);
        registered++;
      } catch (err) {
        console.error(`  ✗ Failed for "${text}":`, err);
        errors++;
      }
    } else {
      registered++; // count what would be registered
    }
  }

  await ds.destroy();

  console.log('\n─────────────────────────────────────────');
  console.log(`Total R2 files scanned:  ${keys.length}`);
  console.log(`Words registered:        ${registered}${DRY_RUN ? ' (dry run)' : ''}`);
  console.log(`Already registered:      ${skipped}`);
  console.log(`No matching card:        ${noCard}`);
  console.log(`Errors:                  ${errors}`);
  console.log('─────────────────────────────────────────\n');

  if (errors > 0) process.exit(1);
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
