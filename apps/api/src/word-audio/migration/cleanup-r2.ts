/**
 * LC-WA13 · R2 cleanup: deduplicate storage, remove orphaned files
 *
 * Run AFTER migrate-card-audio.ts has completed and been verified.
 *
 * Three passes:
 *   1. Old pronunciation files — delete pronunciation/{cardId}.wav files
 *      that have been successfully migrated to the word_audio registry.
 *   2. Orphaned word-audio files — delete word-audio/*.wav files that have
 *      no matching row in the word_audio table.
 *   3. Zombie DB rows — mark word_audio rows as failed when their R2 file
 *      no longer exists, so they regenerate on next resolve().
 *
 * Run from the repo root:
 *   npx ts-node -r tsconfig-paths/register \
 *     apps/api/src/word-audio/migration/cleanup-r2.ts [--dry-run] [--confirm]
 *
 * --dry-run   Show what would be deleted without making any changes.
 * --confirm   Required to actually perform deletions (safety gate).
 */

import 'reflect-metadata';
import { DataSource, In } from 'typeorm';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';
import { WordAudioEntity } from '../word-audio.entity';
import { CardEntity } from '../../cards/card.entity';
import { normalizeForAudio, audioStorageHash } from '../normalize';

const DRY_RUN = process.argv.includes('--dry-run');
const CONFIRMED = process.argv.includes('--confirm');

if (!DRY_RUN && !CONFIRMED) {
  console.error('Error: pass --confirm to run deletions, or --dry-run to preview.');
  process.exit(1);
}

// ─── DB ───────────────────────────────────────────────────────────────────────

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

// ─── R2 ───────────────────────────────────────────────────────────────────────

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

async function deleteObject(s3: S3Client, bucket: string, key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

async function objectExists(s3: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  console.log(DRY_RUN ? '🔍 DRY RUN — no changes will be made\n' : '🗑  CLEANUP — deleting files\n');

  const bucket = process.env['R2_BUCKET'] ?? '';
  if (!bucket) {
    console.error('R2_BUCKET must be set');
    process.exit(1);
  }

  const ds = await createDataSource();
  const s3 = createS3();

  const cardRepo = ds.getRepository(CardEntity);
  const wordAudioRepo = ds.getRepository(WordAudioEntity);

  let oldFilesDeleted = 0;
  let orphansRemoved = 0;
  let zombiesFlagged = 0;
  let bytesFreed = 0;

  // ── Pass 1: Remove old pronunciation/{cardId}.wav files ───────────────────
  console.log('Pass 1: Old pronunciation files\n');

  const pronunciationKeys = await listAllObjects(s3, bucket, 'pronunciation/');
  console.log(`  Found ${pronunciationKeys.length} files under pronunciation/`);

  for (const key of pronunciationKeys) {
    const cardId = key.replace('pronunciation/', '').replace('.wav', '');

    const card = await cardRepo.findOne({ where: { id: cardId } });
    if (!card) {
      console.log(`  ⏭ No card for ${key} — skipping`);
      continue;
    }

    const text = (card.content.article ? `${card.content.article} ` : '') + card.content.back;
    const normalizedText = normalizeForAudio(text, 'de-DE');
    const migrated = await wordAudioRepo.findOne({ where: { normalizedText, language: 'de-DE' } });

    if (!migrated || migrated.status !== 'ready') {
      console.log(`  ⚠ Not yet migrated: ${key} — skipping`);
      continue;
    }

    console.log(`  🗑 Delete ${key} (migrated to ${migrated.storagePath})`);
    if (!DRY_RUN) {
      await deleteObject(s3, bucket, key);
      oldFilesDeleted++;
    } else {
      oldFilesDeleted++;
    }
  }

  // ── Pass 2: Orphaned word-audio files ─────────────────────────────────────
  console.log('\nPass 2: Orphaned word-audio files\n');

  const wordAudioKeys = await listAllObjects(s3, bucket, 'word-audio/');
  console.log(`  Found ${wordAudioKeys.length} files under word-audio/`);

  const allRows = await wordAudioRepo.find({ select: ['storagePath'] });
  const registeredPaths = new Set(allRows.map(r => r.storagePath).filter(Boolean) as string[]);

  for (const key of wordAudioKeys) {
    if (!registeredPaths.has(key)) {
      console.log(`  🗑 Orphan: ${key}`);
      if (!DRY_RUN) {
        await deleteObject(s3, bucket, key);
        orphansRemoved++;
      } else {
        orphansRemoved++;
      }
    }
  }

  // ── Pass 3: Zombie DB rows ────────────────────────────────────────────────
  console.log('\nPass 3: Zombie DB rows (status=ready but R2 file missing)\n');

  const readyRows = await wordAudioRepo.find({ where: { status: 'ready' } });
  console.log(`  Checking ${readyRows.length} ready rows`);

  const now = new Date();
  for (const row of readyRows) {
    if (!row.storagePath) continue;
    const exists = await objectExists(s3, bucket, row.storagePath);
    if (!exists) {
      console.log(`  ⚠ Zombie: ${row.normalizedText} → ${row.storagePath}`);
      if (!DRY_RUN) {
        row.status = 'failed';
        row.failedAt = now;
        await wordAudioRepo.save(row);
        zombiesFlagged++;
      } else {
        zombiesFlagged++;
      }
    }
  }

  await ds.destroy();

  console.log('\n─────────────────────────────────────────');
  console.log(`Old pronunciation files deleted: ${oldFilesDeleted}${DRY_RUN ? ' (dry run)' : ''}`);
  console.log(`Orphaned word-audio files removed: ${orphansRemoved}${DRY_RUN ? ' (dry run)' : ''}`);
  console.log(`Zombie DB rows flagged: ${zombiesFlagged}${DRY_RUN ? ' (dry run)' : ''}`);
  if (bytesFreed > 0) console.log(`Storage freed: ${(bytesFreed / 1024 / 1024).toFixed(2)} MB`);
  console.log('─────────────────────────────────────────\n');
}

run().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
