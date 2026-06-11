/**
 * Idempotent backfill: walks all cards, upserts a word_dictionary entry for each
 * distinct normalized word, links audio, and stamps dictionaryWordId back onto cards.
 *
 * Safe to re-run — already-linked cards are skipped; existing dictionary entries
 * are preserved (first writer wins via upsertOnConflict).
 *
 * Usage:
 *   npx ts-node apps/api/src/scripts/backfill-word-dictionary.ts
 *   npx ts-node apps/api/src/scripts/backfill-word-dictionary.ts --dry-run
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { CardEntity } from '../cards/card.entity';
import { WordDictionaryEntity } from '../word-dictionary/word-dictionary.entity';
import { WordAudioEntity } from '../word-audio/word-audio.entity';
import { normalizeLemma } from '../word-dictionary/normalize-lemma';
import type { CardContent } from '@lingua-card/shared/domain';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 50;

async function run(): Promise<void> {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env['DATABASE_URL'] ?? 'postgres://postgres:postgres@localhost:5432/linguacard',
    ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : false,
    entities: [CardEntity, WordDictionaryEntity, WordAudioEntity],
    synchronize: false,
    logging: false,
  });

  await dataSource.initialize();

  const cardRepo = dataSource.getRepository(CardEntity);
  const dictRepo = dataSource.getRepository(WordDictionaryEntity);
  const audioRepo = dataSource.getRepository(WordAudioEntity);

  const total = await cardRepo.count();
  console.log(`Found ${total} cards to process.`);

  let upserted = 0;
  let linked = 0;
  let skipped = 0;
  let offset = 0;

  while (offset < total) {
    const batch = await cardRepo.find({ skip: offset, take: BATCH_SIZE, order: { id: 'ASC' } });
    offset += batch.length;
    if (!batch.length) break;

    for (const card of batch) {
      const content = card.content as CardContent;
      if (!content?.back?.trim()) { skipped++; continue; }

      const lemmaKey = normalizeLemma(content.back, content.article);
      const targetLang = 'de-DE';
      const nativeLang = 'en';

      // Check if dictionary entry exists
      let entry: WordDictionaryEntity | null = await dictRepo.findOne({
        where: { lemmaKey, targetLang, nativeLang },
      });

      if (!entry) {
        // Look for matching audio record for audio link
        const audioKey = content.article
          ? `${content.article} ${content.back}`.toLowerCase().trim()
          : content.back.toLowerCase().trim();
        const audioRecord = await audioRepo.findOne({
          where: { normalizedText: audioKey, language: targetLang },
        });

        if (!DRY_RUN) {
          const newEntry = dictRepo.create({
            id: crypto.randomUUID(),
            lemmaKey,
            targetLang,
            nativeLang,
            displayText: content.back,
            article: (content.article as 'der' | 'die' | 'das' | null) ?? null,
            gender: content.gender ?? null,
            translation: content.front ?? '',
            wordType: content.article ? 'noun' : 'other',
            phonetic: content.phonetic ?? null,
            cefrLevel: null,
            categoryName: 'Other',
            examples: content.examples ?? [],
            synonyms: content.synonyms ?? [],
            plurals: content.plural ? [content.plural] : [],
            wordAudioId: audioRecord?.id ?? null,
            source: 'admin',
            model: null,
          });
          try {
            entry = await dictRepo.save(newEntry);
            upserted++;
          } catch (err: unknown) {
            // Unique constraint violation — another card already created this entry
            if ((err as { code?: string }).code === '23505') {
              entry = await dictRepo.findOne({ where: { lemmaKey, targetLang, nativeLang } }) ?? null;
            } else {
              throw err;
            }
          }
        } else {
          console.log(`[dry-run] Would upsert: "${lemmaKey}"`);
          upserted++;
        }
      }

      // Stamp dictionaryWordId back onto card if not already set
      const entryId = entry?.id;
      if (entryId && card.dictionaryWordId !== entryId) {
        if (!DRY_RUN) {
          const updatedContent = { ...content, dictionaryWordId: entryId };
          await cardRepo.update(card.id, { content: updatedContent as unknown as CardContent, dictionaryWordId: entryId });
        } else {
          console.log(`[dry-run] Would link card ${card.id} → dictionary ${entryId}`);
        }
        linked++;
      } else {
        skipped++;
      }
    }

    console.log(`Processed ${offset}/${total} cards…`);
  }

  await dataSource.destroy();

  console.log(`\nBackfill complete${DRY_RUN ? ' (dry-run)' : ''}:`);
  console.log(`  Dictionary entries upserted: ${upserted}`);
  console.log(`  Cards linked:               ${linked}`);
  console.log(`  Cards skipped:              ${skipped}`);
}

run().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
