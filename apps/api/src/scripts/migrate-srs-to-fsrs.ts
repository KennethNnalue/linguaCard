/**
 * One-time migration: SM-2 SRS states → FSRS equivalents.
 * Run once on production after deploying the FSRS algorithm update.
 * Idempotent — rows already marked algorithm:'fsrs' are skipped.
 *
 * Usage: npx ts-node apps/api/src/scripts/migrate-srs-to-fsrs.ts
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { CardEntity } from '../cards/card.entity';
import { stabilityToMastery } from '@lingua-card/shared/utils';
import type { SRSStateData } from '@lingua-card/shared/domain';

async function migrate(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(CardEntity);
  const cards = await repo.find();
  let updated = 0;

  for (const card of cards) {
    const s = card.srsState as SRSStateData | null;
    if (!s || s.algorithm === 'fsrs') continue;

    const stability = s.intervalDays ?? 1;

    // Map old lastRating (0–5 SM-2) to difficulty (1–10 FSRS, inverted)
    const rawRating = Math.max(1, Math.min(4, (s.lastRating as number) ?? 3));
    const difficulty = Math.round(10 - (rawRating - 1) * 3);

    const daysSince = s.lastReviewedAt
      ? Math.floor((Date.now() - new Date(s.lastReviewedAt).getTime()) / 86_400_000)
      : 0;
    const retrievability = stability > 0
      ? Math.round(Math.exp(-daysSince / stability) * 1000) / 1000
      : 0;

    const masteryLevel = s.state === 'new' ? 0 : stabilityToMastery(stability);

    card.srsState = {
      ...s,
      algorithm: 'fsrs',
      stability,
      difficulty,
      retrievability,
      masteryLevel,
    } as SRSStateData;

    updated++;
  }

  if (updated > 0) {
    await repo.save(cards.filter(c => (c.srsState as SRSStateData)?.algorithm === 'fsrs'));
  }

  console.log(`Migrated ${updated} / ${cards.length} cards from SM-2 → FSRS.`);
}

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env['DATABASE_URL'],
  entities: [CardEntity],
  synchronize: false,
});

dataSource
  .initialize()
  .then(() => migrate(dataSource))
  .finally(() => dataSource.destroy());
