import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { ConfigService } from '@nestjs/config';
import type { CardContent } from '@lingua-card/shared/domain';
import { DataSource, MoreThan } from 'typeorm';
import { legacyCardToVocabularyProjection } from '../learning-items/migration/canonical-backfill-card.mapper';
import { WordAudioEntity } from '../word-audio/word-audio.entity';
import { legacyDictionaryEntryToProjectionInput } from '../word-dictionary/legacy-vocabulary.mapper';
import { WordDictionaryEntity } from '../word-dictionary/word-dictionary.entity';
import { LexemeIdentityService } from '../vocabulary/domain/lexeme-identity.service';
import { stableResourceId } from '../vocabulary/domain/stable-resource-id';
import { SpeechIdentityService } from '../vocabulary/domain/speech-identity.service';
import { VOCABULARY_ENTITIES } from '../vocabulary/vocabulary.module';
import { LegacySpeechAssetProjectionService } from '../vocabulary/services/legacy-speech-asset-projection.service';
import { LegacyVocabularyProjectionService } from '../vocabulary/services/legacy-vocabulary-projection.service';

dotenv.config();

const BATCH_SIZE = 100;
const JOB_KEY = 'canonical-learning-items-v2';
const LOCK_ID = 7_314_209_006;
const validateOnly = process.argv.includes('--validate-only');
type Phase = 'dictionary' | 'audio' | 'linked_cards' | 'unlinked_cards' | 'complete';
interface State { phase: Phase; cursor: string; processedCount: number }
interface CardRow {
  id: string; userId: string; collectionId: string | null; dictionaryWordId: string | null;
  content: CardContent; createdAt: Date; updatedAt: Date;
}
interface Report {
  unresolvedDictionaryCards: number; missingDictionaryLinkedItems: number;
  invalidMemberships: number; collectionContextMismatches: number;
}

function count(value: string | number | undefined): number {
  const result = Number(value ?? 0);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error(`Invalid count: ${String(value)}`);
  return result;
}

async function ensureJob(source: DataSource): Promise<void> {
  await source.query(`CREATE TABLE IF NOT EXISTS data_migration_jobs (
    key varchar PRIMARY KEY, phase varchar(30) NOT NULL, cursor varchar NOT NULL DEFAULT '',
    "processedCount" integer NOT NULL DEFAULT 0, status varchar(20) NOT NULL DEFAULT 'running',
    "startedAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "completedAt" timestamptz, "lastError" text)`);
  await source.query(`INSERT INTO data_migration_jobs (key, phase) VALUES ($1, 'dictionary') ON CONFLICT DO NOTHING`, [JOB_KEY]);
}

async function state(source: DataSource): Promise<State> {
  const rows = await source.query<Array<{ phase: Phase; cursor: string; processedCount: number }>>(
    `SELECT phase, cursor, "processedCount" FROM data_migration_jobs WHERE key = $1`, [JOB_KEY]);
  if (!rows[0]) throw new Error('Backfill job state is missing');
  return { ...rows[0], processedCount: count(rows[0].processedCount) };
}

async function save(source: DataSource, phase: Phase, cursor: string, processed: number): Promise<void> {
  await source.query(`UPDATE data_migration_jobs SET phase=$2::varchar, cursor=$3, "processedCount"=$4,
    status=CASE WHEN $2::varchar='complete' THEN 'complete' ELSE 'running' END, "updatedAt"=now(),
    "completedAt"=CASE WHEN $2::varchar='complete' THEN now() ELSE NULL END, "lastError"=NULL WHERE key=$1`,
  [JOB_KEY, phase, cursor, processed]);
}

async function prepare(source: DataSource): Promise<void> {
  await source.query(`UPDATE cards card SET "collectionId"=NULL, "updatedAt"=now()
    WHERE card."collectionId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM collections c
    WHERE c.id=card."collectionId" AND c."userId"=card."userId")`);
  await source.query(`INSERT INTO users (id,email,name,"passwordHash","avatarInitials","isAdmin")
    SELECT 'user-001','migrated-user-001@invalid.local','Demo learner','!disabled-migrated-demo-account','DL',false
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE id='user-001') AND EXISTS
    (SELECT 1 FROM cards WHERE "userId"='user-001' UNION ALL SELECT 1 FROM collections WHERE "userId"='user-001')
    ON CONFLICT DO NOTHING`);
}

async function dictionaryPhase(source: DataSource, projection: LegacyVocabularyProjectionService, current: State): Promise<State> {
  const repository = source.getRepository(WordDictionaryEntity);
  let cursor = current.cursor;
  let processed = current.processedCount;
  while (true) {
    const rows = await repository.find({ where: cursor ? { id: MoreThan(cursor) } : {}, order: { id: 'ASC' }, take: BATCH_SIZE });
    if (!rows.length) break;
    await projection.projectMany(rows.map(row => ({ input: legacyDictionaryEntryToProjectionInput(row), legacyDictionaryWordId: row.id })));
    cursor = rows.at(-1)?.id ?? cursor;
    processed += rows.length;
    await save(source, 'dictionary', cursor, processed);
    console.log(`Dictionary: ${processed} committed; cursor=${cursor}`);
  }
  await save(source, 'audio', '', 0);
  return { phase: 'audio', cursor: '', processedCount: 0 };
}

async function audioPhase(source: DataSource, projection: LegacySpeechAssetProjectionService, current: State): Promise<State> {
  const repository = source.getRepository(WordAudioEntity);
  let cursor = current.cursor;
  let processed = current.processedCount;
  while (true) {
    const rows = await repository.find({ where: cursor ? { id: MoreThan(cursor) } : {}, order: { id: 'ASC' }, take: BATCH_SIZE });
    if (!rows.length) break;
    for (const row of rows) await projection.project({ language: row.language, text: row.displayText,
      audioUrl: row.audioUrl, storagePath: row.storagePath, durationMs: row.durationMs, status: row.status, failedAt: row.failedAt });
    cursor = rows.at(-1)?.id ?? cursor;
    processed += rows.length;
    await save(source, 'audio', cursor, processed);
    console.log(`Audio: ${processed} committed; cursor=${cursor}`);
  }
  await save(source, 'linked_cards', '', 0);
  return { phase: 'linked_cards', cursor: '', processedCount: 0 };
}

async function linkedCardPhase(source: DataSource, current: State): Promise<State> {
  let cursor = current.cursor;
  let processed = current.processedCount;
  while (true) {
    const rows = await source.query<Array<{ id: string }>>(`SELECT card.id FROM cards card
      JOIN legacy_dictionary_lexemes map ON map."dictionaryWordId"=card."dictionaryWordId"
      WHERE card."contextId"='german-vocab' AND card.id>$1 ORDER BY card.id LIMIT $2`, [cursor, BATCH_SIZE]);
    if (!rows.length) break;
    await source.query(`UPDATE cards SET "updatedAt"="updatedAt" WHERE id=ANY($1::varchar[])`, [rows.map(row => row.id)]);
    cursor = rows.at(-1)?.id ?? cursor;
    processed += rows.length;
    await save(source, 'linked_cards', cursor, processed);
    console.log(`Linked cards: ${processed} committed; cursor=${cursor}`);
  }
  await save(source, 'unlinked_cards', '', 0);
  return { phase: 'unlinked_cards', cursor: '', processedCount: 0 };
}

async function persistCard(source: DataSource, projection: LegacyVocabularyProjectionService, card: CardRow): Promise<void> {
  const vocabulary = await projection.project(legacyCardToVocabularyProjection(card.content), card.dictionaryWordId ?? undefined);
  const proposedContextId = stableResourceId('learning-context', card.userId, 'en', 'de');
  await source.transaction(async manager => {
    await manager.query(`INSERT INTO learning_contexts (id,"userId","sourceLanguage","targetLanguage","isActive")
      VALUES ($1::varchar,$2::varchar,'en','de',NOT EXISTS (SELECT 1 FROM learning_contexts WHERE "userId"=$2::varchar AND "isActive"=true))
      ON CONFLICT ("userId","sourceLanguage","targetLanguage") DO NOTHING`, [proposedContextId, card.userId]);
    const contexts: Array<{ id: string }> = await manager.query(`SELECT id FROM learning_contexts
      WHERE "userId"=$1 AND "sourceLanguage"='en' AND "targetLanguage"='de'`, [card.userId]);
    const contextId = contexts[0]?.id;
    if (!contextId) throw new Error(`Missing context for user ${card.userId}`);
    await manager.query(`INSERT INTO learning_items (id,"userId","learningContextId","lexemeId","legacyCardId",
      "personalNote","customImageUrl","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$1,$5,$6,$7,$8)
      ON CONFLICT ("userId","learningContextId","lexemeId") DO NOTHING`,
    [card.id, card.userId, contextId, vocabulary.lexemeId, card.content.notes, card.content.imageUrl, card.createdAt, card.updatedAt]);
    const items: Array<{ id: string }> = await manager.query(`SELECT id FROM learning_items
      WHERE "userId"=$1 AND "learningContextId"=$2 AND "lexemeId"=$3`, [card.userId, contextId, vocabulary.lexemeId]);
    const itemId = items[0]?.id;
    if (!itemId) throw new Error(`Missing learning item for card ${card.id}`);
    if (!card.collectionId) return;
    await manager.query(`UPDATE collections SET "learningContextId"=$2,
      "coverSeed"=COALESCE("coverSeed",lower(trim(name))) WHERE id=$1 AND "userId"=$3`,
    [card.collectionId, contextId, card.userId]);
    await manager.query(`INSERT INTO user_collection_items ("collectionId","learningItemId",position)
      VALUES ($1::varchar,$2::varchar,(SELECT COALESCE(MAX(position)+1,0) FROM user_collection_items WHERE "collectionId"=$1::varchar))
      ON CONFLICT DO NOTHING`, [card.collectionId, itemId]);
  });
}

async function unlinkedCardPhase(source: DataSource, projection: LegacyVocabularyProjectionService, current: State): Promise<State> {
  let cursor = current.cursor;
  let processed = current.processedCount;
  while (true) {
    const rows = await source.query<CardRow[]>(`SELECT card.id,card."userId",card."collectionId",card."dictionaryWordId",
      card.content,card."createdAt",card."updatedAt" FROM cards card LEFT JOIN legacy_dictionary_lexemes map
      ON map."dictionaryWordId"=card."dictionaryWordId" WHERE card."contextId"='german-vocab'
      AND map."dictionaryWordId" IS NULL AND card.id>$1 AND EXISTS (SELECT 1 FROM users u WHERE u.id=card."userId")
      ORDER BY card.id LIMIT $2`, [cursor, BATCH_SIZE]);
    if (!rows.length) break;
    for (const row of rows) await persistCard(source, projection, row);
    cursor = rows.at(-1)?.id ?? cursor;
    processed += rows.length;
    await save(source, 'unlinked_cards', cursor, processed);
    console.log(`Unlinked cards: ${processed} committed; cursor=${cursor}`);
  }
  return { phase: 'unlinked_cards', cursor, processedCount: processed };
}

async function validate(source: DataSource): Promise<Report> {
  const rows = await source.query<Array<Record<keyof Report, string>>>(`SELECT
    (SELECT COUNT(*)::text FROM cards c LEFT JOIN legacy_dictionary_lexemes m ON m."dictionaryWordId"=c."dictionaryWordId"
      WHERE c."contextId"='german-vocab' AND c."dictionaryWordId" IS NOT NULL AND m."dictionaryWordId" IS NULL) "unresolvedDictionaryCards",
    (SELECT COUNT(*)::text FROM cards c JOIN legacy_dictionary_lexemes m ON m."dictionaryWordId"=c."dictionaryWordId"
      LEFT JOIN learning_contexts x ON x."userId"=c."userId" AND x."sourceLanguage"='en' AND x."targetLanguage"='de'
      LEFT JOIN learning_items i ON i."userId"=c."userId" AND i."learningContextId"=x.id AND i."lexemeId"=m."lexemeId"
      WHERE c."contextId"='german-vocab' AND i.id IS NULL) "missingDictionaryLinkedItems",
    (SELECT COUNT(*)::text FROM user_collection_items m LEFT JOIN collections c ON c.id=m."collectionId"
      LEFT JOIN learning_items i ON i.id=m."learningItemId" WHERE c.id IS NULL OR i.id IS NULL) "invalidMemberships",
    (SELECT COUNT(*)::text FROM user_collection_items m JOIN collections c ON c.id=m."collectionId"
      JOIN learning_items i ON i.id=m."learningItemId" WHERE c."userId"<>i."userId"
      OR c."learningContextId" IS DISTINCT FROM i."learningContextId") "collectionContextMismatches"`);
  const row = rows[0];
  if (!row) throw new Error('Validation returned no result');
  return { unresolvedDictionaryCards: count(row.unresolvedDictionaryCards),
    missingDictionaryLinkedItems: count(row.missingDictionaryLinkedItems), invalidMemberships: count(row.invalidMemberships),
    collectionContextMismatches: count(row.collectionContextMismatches) };
}

function assertValid(report: Report): void {
  const failures = Object.entries(report).filter(([, value]) => value > 0);
  if (failures.length) throw new Error(`Validation failed: ${failures.map(([key, value]) => `${key}=${value}`).join(', ')}`);
}

async function run(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is required');
  const source = new DataSource({ type: 'postgres', url,
    ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : false,
    entities: [WordDictionaryEntity, WordAudioEntity, ...VOCABULARY_ENTITIES], synchronize: false });
  await source.initialize();
  let locked = false;
  try {
    const locks = await source.query<Array<{ acquired: boolean }>>('SELECT pg_try_advisory_lock($1) acquired', [LOCK_ID]);
    locked = locks[0]?.acquired ?? false;
    if (!locked) throw new Error('Another canonical backfill is already running');
    if (validateOnly) { const report = await validate(source); console.log('Validation report:', report); assertValid(report); return; }
    await ensureJob(source);
    await prepare(source);
    const vocabulary = new LegacyVocabularyProjectionService(source, new LexemeIdentityService());
    const speech = new LegacySpeechAssetProjectionService(source, new SpeechIdentityService(),
      new ConfigService({ ai: { googleCloudTtsVoice: process.env['GOOGLE_CLOUD_TTS_VOICE'] ?? 'de-DE-Chirp3-HD-Charon' } }));
    let current = await state(source);
    if (current.phase === 'dictionary') current = await dictionaryPhase(source, vocabulary, current);
    if (current.phase === 'audio') current = await audioPhase(source, speech, current);
    if (current.phase === 'linked_cards') current = await linkedCardPhase(source, current);
    if (current.phase === 'unlinked_cards') current = await unlinkedCardPhase(source, vocabulary, current);
    const report = await validate(source);
    console.log('Validation report:', report);
    assertValid(report);
    await source.query(`CREATE TABLE IF NOT EXISTS data_migration_markers
      (key varchar PRIMARY KEY,"completedAt" timestamptz NOT NULL DEFAULT now())`);
    await source.query(`INSERT INTO data_migration_markers (key) VALUES ($1)
      ON CONFLICT (key) DO UPDATE SET "completedAt"=now()`, [JOB_KEY]);
    await save(source, 'complete', current.cursor, current.processedCount);
    console.log('Canonical learning-item backfill complete.');
  } catch (error) {
    if (!validateOnly) {
      try {
        await ensureJob(source);
        await source.query(`UPDATE data_migration_jobs SET status='failed',"lastError"=$2,
          "updatedAt"=now() WHERE key=$1`, [JOB_KEY, error instanceof Error ? error.message : 'Unknown failure']);
      } catch (checkpointError) {
        console.error('Unable to record canonical backfill failure:', checkpointError);
      }
    }
    throw error;
  } finally {
    if (locked) await source.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]);
    await source.destroy();
  }
}

void run().catch((error: unknown) => { console.error('Canonical backfill failed:', error); process.exitCode = 1; });
