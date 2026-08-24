import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { WordAudioEntity } from '../word-audio/word-audio.entity';
import { WordDictionaryEntity } from '../word-dictionary/word-dictionary.entity';
import { legacyDictionaryEntryToProjectionInput } from '../word-dictionary/legacy-vocabulary.mapper';
import { LexemeIdentityService } from '../vocabulary/domain/lexeme-identity.service';
import { SpeechIdentityService } from '../vocabulary/domain/speech-identity.service';
import { VOCABULARY_ENTITIES } from '../vocabulary/vocabulary.module';
import { LegacySpeechAssetProjectionService } from '../vocabulary/services/legacy-speech-asset-projection.service';
import { LegacyVocabularyProjectionService } from '../vocabulary/services/legacy-vocabulary-projection.service';

const BATCH_SIZE = 100;
const isDryRun = process.argv.includes('--dry-run');

async function run(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : false,
    entities: [WordDictionaryEntity, WordAudioEntity, ...VOCABULARY_ENTITIES],
    synchronize: false,
  });
  await dataSource.initialize();

  try {
    const dictionaryRepo = dataSource.getRepository(WordDictionaryEntity);
    const audioRepo = dataSource.getRepository(WordAudioEntity);
    const dictionaryCount = await dictionaryRepo.count();
    const audioCount = await audioRepo.count();
    const [linkedCardCountRow] = await dataSource.query<Array<{ count: string }>>(`
      SELECT COUNT(*)::text AS count FROM cards
      WHERE "contextId" = 'german-vocab' AND "dictionaryWordId" IS NOT NULL
    `);
    const [unlinkedCardCountRow] = await dataSource.query<Array<{ count: string }>>(`
      SELECT COUNT(*)::text AS count FROM cards
      WHERE "contextId" = 'german-vocab' AND "dictionaryWordId" IS NULL
    `);
    const linkedCardCount = Number.parseInt(linkedCardCountRow?.count ?? '0', 10);
    const unlinkedCardCount = Number.parseInt(unlinkedCardCountRow?.count ?? '0', 10);
    console.log(`Legacy dictionary rows: ${dictionaryCount}`);
    console.log(`Legacy audio rows: ${audioCount}`);
    console.log(`Dictionary-linked cards eligible for projection: ${linkedCardCount}`);
    console.log(`Unlinked cards requiring later resolution: ${unlinkedCardCount}`);

    if (isDryRun) {
      console.log('Dry run complete. No multilingual records were written.');
      return;
    }

    const vocabularyProjection = new LegacyVocabularyProjectionService(
      dataSource,
      new LexemeIdentityService(),
    );
    const config = new ConfigService({
      ai: {
        googleCloudTtsVoice: process.env['GOOGLE_CLOUD_TTS_VOICE']
          ?? 'de-DE-Chirp3-HD-Charon',
      },
    });
    const speechProjection = new LegacySpeechAssetProjectionService(
      dataSource,
      new SpeechIdentityService(),
      config,
    );

    let projectedDictionaryRows = 0;
    while (projectedDictionaryRows < dictionaryCount) {
      const entries = await dictionaryRepo.find({
        order: { enrichedAt: 'ASC', id: 'ASC' },
        skip: projectedDictionaryRows,
        take: BATCH_SIZE,
      });
      if (!entries.length) break;
      await vocabularyProjection.projectMany(
        entries.map(entry => ({
          input: legacyDictionaryEntryToProjectionInput(entry),
          legacyDictionaryWordId: entry.id,
        })),
      );
      projectedDictionaryRows += entries.length;
      console.log(`Projected dictionary rows: ${projectedDictionaryRows}/${dictionaryCount}`);
    }

    let projectedAudioRows = 0;
    while (projectedAudioRows < audioCount) {
      const entries = await audioRepo.find({
        order: { createdAt: 'ASC', id: 'ASC' },
        skip: projectedAudioRows,
        take: BATCH_SIZE,
      });
      if (!entries.length) break;
      for (const entry of entries) {
        await speechProjection.project({
          language: entry.language,
          text: entry.displayText,
          audioUrl: entry.audioUrl,
          storagePath: entry.storagePath,
          durationMs: entry.durationMs,
          status: entry.status,
          failedAt: entry.failedAt,
        });
      }
      projectedAudioRows += entries.length;
      console.log(`Projected audio rows: ${projectedAudioRows}/${audioCount}`);
    }

    let projectedCards = 0;
    let lastCardId = '';
    while (projectedCards < linkedCardCount) {
      const cards = await dataSource.query<Array<{ id: string }>>(`
        SELECT id FROM cards
        WHERE "contextId" = 'german-vocab'
          AND "dictionaryWordId" IS NOT NULL
          AND id > $1
        ORDER BY id ASC
        LIMIT $2
      `, [lastCardId, BATCH_SIZE]);
      if (!cards.length) break;
      const cardIds = cards.map(card => card.id);
      await dataSource.query(`
        UPDATE cards SET "updatedAt" = "updatedAt"
        WHERE id = ANY($1::varchar[])
      `, [cardIds]);
      projectedCards += cards.length;
      lastCardId = cards[cards.length - 1].id;
      console.log(`Projected cards: ${projectedCards}/${linkedCardCount}`);
    }

    console.log('Multilingual vocabulary backfill complete.');
  } finally {
    await dataSource.destroy();
  }
}

run().catch((error: unknown) => {
  console.error('Multilingual vocabulary backfill failed:', error);
  process.exitCode = 1;
});
