/**
 * One-time backfill: add missing quiz questions to stories that have fewer
 * than calculateQuizCount(sentences.length) requires.
 * Idempotent — stories already at or above the target count are skipped.
 *
 * Usage:
 *   DATABASE_URL=<url> OPENROUTER_API_KEY=<key> \
 *   npx ts-node -r tsconfig-paths/register apps/api/src/scripts/backfill-quiz-questions.ts
 *
 * Optional env vars:
 *   BACKFILL_MODEL  — OpenRouter model ID (default: anthropic/claude-haiku-4-5)
 *   DRY_RUN=true    — Log what would change without writing to the DB
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { calculateQuizCount } from '@lingua-card/shared/domain';
import type { StorySentence, StoryQuizQuestion } from '@lingua-card/shared/domain';
import { StoryEntity } from '../stories/story.entity';

dotenv.config({ path: 'apps/api/.env' });
dotenv.config({ path: '.env' });

const MODEL   = process.env['BACKFILL_MODEL'] ?? 'anthropic/claude-haiku-4-5';
const DRY_RUN = process.env['DRY_RUN'] === 'true';
const OPENROUTER_API_KEY = process.env['OPENROUTER_API_KEY'] ?? '';
const OPENROUTER_BASE    = 'https://openrouter.ai/api/v1';

// ─── Prompt builder (inline — no NestJS DI in scripts) ───────────────────────

function buildQuizBackfillPrompt(
  sentences: StorySentence[],
  existingQuestions: StoryQuizQuestion[],
  targetTotal: number,
): string {
  const needed = targetTotal - existingQuestions.length;
  const sentenceList = sentences
    .map((s, i) => `${i + 1}. DE: "${s.german}" | EN: "${s.native}"`)
    .join('\n');

  const alreadyUsed = existingQuestions
    .map(q => `- "${q.sentenceTemplate}" (answer: ${q.correctAnswer})`)
    .join('\n');

  return `You are a German language teacher creating fill-in-the-blank quiz questions.

STORY SENTENCES:
${sentenceList}

ALREADY EXISTING QUESTIONS (do NOT duplicate these):
${alreadyUsed || '(none)'}

TASK: Generate exactly ${needed} NEW fill-in-the-blank questions from the story sentences above.
Each new question must test a DIFFERENT sentence or grammatical point than the existing ones.

RULES:
1. The blank must replace a single word that demonstrates a grammar rule (article case, modal verb form, preposition, adjective ending, verb conjugation).
2. The correct answer must come from the actual story sentence.
3. Generate exactly 2 distractors — plausible but grammatically wrong.
4. Distractors test the SAME grammatical dimension as the blank.
5. Include a short 1-sentence English hint shown after a wrong answer.
6. The sentenceTemplate must have the blanked word replaced by "___".
7. Generate a unique UUID for each "id" field.

OUTPUT: valid JSON array only, no markdown fences:
[
  {
    "id": "uuid-string",
    "sentenceTemplate": "Er fährt mit ___ U-Bahn zur Arbeit.",
    "audioSentence": "Er fährt mit der U-Bahn zur Arbeit.",
    "correctAnswer": "der",
    "distractors": ["die", "dem"],
    "hint": "Use \\"der\\" (dative feminine) after \\"mit\\"."
  }
]`;
}

// ─── OpenRouter call (no retry needed for a migration script) ─────────────────

async function generateQuizAdditions(
  sentences: StorySentence[],
  existing: StoryQuizQuestion[],
  targetTotal: number,
): Promise<StoryQuizQuestion[]> {
  const prompt = buildQuizBackfillPrompt(sentences, existing, targetTotal);

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer':  'https://linguacard.app',
      'X-Title':       'LinguaCard',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 2048,
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${body}`);
  }

  const json = await res.json() as { choices: Array<{ message: { content: string } }> };
  const raw  = json.choices?.[0]?.message?.content ?? '';
  const clean = (raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? raw).trim();
  const parsed = JSON.parse(clean) as StoryQuizQuestion[];

  if (!Array.isArray(parsed)) throw new Error('Response was not a JSON array');

  // Ensure every item has an id
  return parsed.map(q => ({ ...q, id: q.id || randomUUID() }));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function backfill(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(StoryEntity);

  const stories = await repo.find();
  console.log(`Found ${stories.length} total stories.`);

  const toBackfill = stories.filter(s => {
    const sentences = s.sentences ?? [];
    const existing  = s.quizQuestions ?? [];
    return existing.length < calculateQuizCount(sentences.length);
  });

  if (toBackfill.length === 0) {
    console.log('All stories already have sufficient quiz questions. Nothing to do.');
    return;
  }

  console.log(`${toBackfill.length} stories need additional quiz questions.\n`);

  let succeeded = 0;
  let failed    = 0;

  for (const story of toBackfill) {
    const sentences  = story.sentences ?? [];
    const existing   = story.quizQuestions ?? [];
    const target     = calculateQuizCount(sentences.length);
    const needed     = target - existing.length;

    console.log(`Processing "${story.title}" (id: ${story.id}): ${existing.length} → ${target} questions (+${needed})`);

    if (DRY_RUN) {
      console.log('  [DRY RUN] skipping AI call and DB write.\n');
      continue;
    }

    try {
      const newQuestions = await generateQuizAdditions(sentences, existing, target);
      story.quizQuestions = [...existing, ...newQuestions];
      await repo.save(story);
      console.log(`  ✓ Backfilled story ${story.id}: ${existing.length} → ${story.quizQuestions.length} questions\n`);
      succeeded++;
    } catch (err) {
      console.error(`  ✗ Failed to backfill story ${story.id}:`, err instanceof Error ? err.message : err, '\n');
      failed++;
    }
  }

  console.log('─'.repeat(60));
  console.log(`Backfill complete. Success: ${succeeded} | Failed: ${failed} | Total processed: ${toBackfill.length}`);
  if (DRY_RUN) console.log('(DRY RUN — no changes written to database)');
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const dataSource = new DataSource({
  type:        'postgres',
  url:         process.env['DATABASE_URL'],
  entities:    [StoryEntity],
  synchronize: false,
});

dataSource
  .initialize()
  .then(() => backfill(dataSource))
  .catch(err => { console.error('Fatal error:', err); process.exit(1); })
  .finally(() => dataSource.destroy());
