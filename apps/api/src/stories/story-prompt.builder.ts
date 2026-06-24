import { Injectable } from '@nestjs/common';
import type { GenerateStoryDto, StoryDifficulty, StoryLength, StorySentence } from '@lingua-card/shared/domain';
import { calculateQuizCount, STORY_LENGTH_WORD_RANGES } from '@lingua-card/shared/domain';
import type { CardEntity } from '../cards/card.entity';
import type { StoryEntity } from './story.entity';

@Injectable()
export class StoryPromptBuilder {
  /** "min–max" word-count target per length band, derived from the canonical
   *  ranges so the prompt and length inference never drift apart. */
  private readonly wordTargets: Record<StoryLength, string> = Object.fromEntries(
    (Object.entries(STORY_LENGTH_WORD_RANGES) as Array<[StoryLength, { min: number; max: number }]>)
      .map(([band, { min, max }]) => [band, `${min}–${max}`]),
  ) as Record<StoryLength, string>;

  private readonly cefrDescriptions: Record<StoryDifficulty, string> = {
    'A1': 'extremely simple, present tense only, 3–5 word sentences, most basic vocabulary',
    'A2': 'simple present and past tense, basic vocabulary, short sentences, everyday topics',
    'B1': 'mix of tenses, subordinate clauses, broader vocabulary, narrative structure',
    'B2': 'complex sentences, passive voice, nuanced vocabulary, varied register, subjunctive mood',
  };

  build(dto: GenerateStoryDto, cards: CardEntity[], nativeLanguage = 'English'): string {
    if (dto.length === 'extra-long') {
      return this.buildExtraLongPrompt(dto, cards, nativeLanguage);
    }
    return this.buildStandardPrompt(dto, cards, nativeLanguage);
  }

  /**
   * Single-call generation: produces the story AND its quiz, grammar notes, and
   * keywords in one JSON payload — replacing four separate LLM calls. Used for all
   * lengths except 'extra-long' (which stays on the dedicated podcast path).
   * The generation service falls back to the per-section builders below for any
   * section the combined response omits or leaves empty.
   */
  buildCombined(dto: GenerateStoryDto, cards: CardEntity[], nativeLanguage = 'English'): string {
    const vocabList = this.buildVocabList(cards);
    const cefrDesc = this.cefrDescriptions[dto.difficulty];
    const wordTarget = this.wordTargets[dto.length];

    return `You are a German language teacher creating a personalised story for an adult learner, plus the study aids that go with it. The learner's native language is ${nativeLanguage}.

TASK: Write a ${wordTarget}-word German story that naturally incorporates the learner's vocabulary, then derive a quiz, grammar notes, and a keyword list FROM THAT STORY.

VOCABULARY LIST (use these words in the story — format: German = English):
${vocabList}

STORY RULES:
1. Difficulty level: ${dto.difficulty} — ${cefrDesc}
2. Use at least 70% of the vocabulary words from the list above
3. Every vocabulary word must appear in a natural, everyday context — never artificially inserted
4. Write a complete narrative with a clear beginning, middle, and end
5. Include natural dialogue where it fits the story
6. Vocabulary words must appear in their correct grammatical form (correct article, conjugation, case)
7. Do NOT add words outside the vocabulary list to meet a quota — only use them naturally

QUIZ RULES (field "quizQuestions"):
- 4–6 fill-in-the-blank questions drawn from the story sentences.
- The blank ("___") replaces ONE word that demonstrates a grammar rule (article case, modal verb form, preposition, adjective ending, verb conjugation).
- "correctAnswer" must be the word from the actual sentence; provide exactly 2 plausible-but-wrong "distractors" testing the SAME grammatical dimension.
- "audioSentence" is the full sentence with the blank filled in. "hint" is a 1-sentence ${nativeLanguage} explanation. Generate a unique "id" per question.

GRAMMAR RULES (field "grammarNotes"):
- 2–3 grammar topics ACTUALLY USED in the story and appropriate for ${dto.difficulty}.
- Each: a clear "title"; "exampleDe" copied exactly from the story; a 2–3 paragraph "description" in plain ${nativeLanguage}; for verbs a 6-row present-tense "conjugationTable" (ich/du/er-sie-es/wir/ihr/sie); exactly 2 "additionalExamples" (German + ${nativeLanguage}) different from the story. Generate a unique "id" per note.

KEYWORDS RULES (field "keywords"):
- 8–15 important vocabulary words from the story (nouns, verbs, adjectives).
- "german" = word with article if a noun (e.g. "der Biergarten") or base form otherwise; "germanBase" = without article; "translation" in ${nativeLanguage}; "article" = der/die/das or null; "wordType" = noun/verb/adjective/adverb/other; "level" = CEFR (A1–C2). Sort by level ascending.

OUTPUT FORMAT — respond with valid JSON only, no markdown fences, no other text:
{
  "title": "Story title in German",
  "titleTranslation": "${nativeLanguage} translation of title",
  "sentences": [
    { "german": "German sentence.", "native": "${nativeLanguage} translation.", "vocabWordsUsed": ["word1"] }
  ],
  "quizQuestions": [
    { "id": "uuid", "sentenceTemplate": "Man kann unter ___ Himmel schlafen.", "audioSentence": "Man kann unter dem Himmel schlafen.", "correctAnswer": "dem", "distractors": ["das", "den"], "hint": "${nativeLanguage} hint." }
  ],
  "grammarNotes": [
    { "id": "uuid", "title": "Modal verb \\"können\\"", "exampleDe": "Man kann hier wandern.", "exampleNative": "${nativeLanguage} translation.", "description": "${nativeLanguage} explanation...", "conjugationTable": [{ "pronoun": "ich", "form": "kann" }], "additionalExamples": [{ "de": "Ich kann schwimmen.", "native": "${nativeLanguage}." }] }
  ],
  "keywords": [
    { "german": "wandern", "germanBase": "wandern", "translation": "${nativeLanguage} translation", "article": null, "wordType": "verb", "level": "A1" }
  ]
}`;
  }

  buildQuizPrompt(sentences: StorySentence[], difficulty: StoryDifficulty, nativeLanguage = 'English'): string {
    const targetCount = calculateQuizCount(sentences.length);
    const sentenceList = sentences
      .map((s, i) => `${i + 1}. DE: "${s.german}" | ${nativeLanguage}: "${s.native}"`)
      .join('\n');

    return `You are a German language teacher creating fill-in-the-blank quiz questions for a learner at ${difficulty} level.

STORY SENTENCES:
${sentenceList}

RULES:
1. Generate exactly ${targetCount} fill-in-the-blank questions from the sentences above.
2. The blank must replace a single word that demonstrates a grammar rule (German article case: der/die/das/dem/den, modal verb form, preposition, adjective ending, verb conjugation).
3. The correct answer must come from the actual story sentence.
4. Generate exactly 2 distractors that are plausible but grammatically wrong. For article blanks, use other German articles/cases. For verbs, use wrong conjugations.
5. Distractors should test the SAME grammatical dimension (e.g. der/die/das/dem/den for case; kann/kannst/können for modal verbs).
6. Include a short 1-sentence hint (in ${nativeLanguage}) explaining the grammar rule — shown only after a wrong answer.
7. The sentenceTemplate must have the blanked word replaced by the literal string "___".

OUTPUT: valid JSON array only, no markdown fences:
[
  {
    "id": "uuid-string",
    "sentenceTemplate": "Man kann auch unter ___ Sternenhimmel schlafen.",
    "audioSentence": "Man kann auch unter dem Sternenhimmel schlafen.",
    "correctAnswer": "dem",
    "distractors": ["das", "den"],
    "hint": "Use \\"dem\\" (dative) after \\"unter\\" when expressing location."
  }
]`;
  }

  buildGrammarPrompt(sentences: StorySentence[], difficulty: StoryDifficulty, nativeLanguage = 'English'): string {
    const sentenceList = sentences
      .map((s, i) => `${i + 1}. DE: "${s.german}" | ${nativeLanguage}: "${s.native}"`)
      .join('\n');

    return `You are a German language teacher writing grammar notes for a learner at ${difficulty} level. The learner's native language is ${nativeLanguage}.

STORY SENTENCES:
${sentenceList}

TASK: Identify 2–3 grammar topics that are ACTUALLY USED in the story above and that a ${difficulty} learner should understand.

For each topic:
1. Write a clear, concise title (e.g. "Modal verb \\"können\\"", "Use of \\"manche\\"")
2. Pick the BEST example sentence FROM THE STORY (copy it exactly)
3. Write a 2–3 paragraph description in plain ${nativeLanguage} — no jargon without explanation
4. If it's a verb: include a present-tense conjugation table (6 rows: ich/du/er-sie-es/wir/ihr/sie)
5. If it's an article/declension pattern: include a small usage table
6. Provide EXACTLY 2 additional example sentences (German + ${nativeLanguage} translation) — different from the story
7. Generate a unique UUID for each note's id field

OUTPUT: valid JSON array only, no markdown fences:
[
  {
    "id": "uuid-string",
    "title": "Modal verb \\"können\\"",
    "exampleDe": "Man kann auf hohe Sanddünen wandern.",
    "exampleNative": "${nativeLanguage} translation here.",
    "description": "Description in ${nativeLanguage}...",
    "conjugationTable": [
      { "pronoun": "ich", "form": "kann" },
      { "pronoun": "du", "form": "kannst" },
      { "pronoun": "er/sie/es", "form": "kann" },
      { "pronoun": "wir", "form": "können" },
      { "pronoun": "ihr", "form": "könnt" },
      { "pronoun": "sie", "form": "können" }
    ],
    "additionalExamples": [
      { "de": "Ich kann Klavier spielen.", "native": "${nativeLanguage} translation." },
      { "de": "Du kannst hier nicht parken.", "native": "${nativeLanguage} translation." }
    ]
  }
]`;
  }

  buildKeywordsPrompt(sentences: StorySentence[], difficulty: StoryDifficulty, nativeLanguage = 'English'): string {
    const sentenceList = sentences
      .map(s => s.german)
      .join(' ');

    return `You are a German language expert. Extract the key vocabulary words from this German story for a ${difficulty} learner. Provide translations in ${nativeLanguage}.

STORY TEXT:
${sentenceList}

TASK: Identify 8–15 important vocabulary words from the text above. Include nouns, verbs, and adjectives that are useful for the learner to know.

For each word provide:
- "german": the word with article if a noun (e.g. "der Biergarten"), or base infinitive if a verb (e.g. "wandern"), or base form if adjective
- "germanBase": the word without article (e.g. "Biergarten", "wandern", "trocken")
- "translation": clear ${nativeLanguage} translation
- "article": "der", "die", "das", or null for non-nouns
- "wordType": one of "noun", "verb", "adjective", "adverb", "other"
- "level": CEFR level "A1", "A2", "B1", "B2", "C1", or "C2"

Sort by level ascending (A1 first, C2 last).

OUTPUT: valid JSON array only, no markdown fences:
[
  { "german": "wandern", "germanBase": "wandern", "translation": "${nativeLanguage} translation", "article": null, "wordType": "verb", "level": "A1" }
]`;
  }

  buildExtensionPrompt(entity: StoryEntity): string {
    const existingSentences = (entity.sentences ?? [])
      .map((s, i) => `${i + 1}. ${s.german}`)
      .join('\n');

    const targetSentenceCount = this.targetCountForLength(entity.lengthType);
    const remaining = Math.max(5, targetSentenceCount - (entity.sentences?.length ?? 0));

    const difficulty = (entity.difficultyLevel ?? 'A2') as StoryDifficulty;
    const cefrDesc = this.cefrDescriptions[difficulty];

    return `You are continuing an unfinished German learning story.

STORY SO FAR (do not repeat these sentences):
${existingSentences}

TASK: Continue the story naturally from the last sentence above.
Write exactly ${remaining} additional sentences that:
- Follow on directly from sentence ${entity.sentences?.length ?? 0}
- Match the same characters, setting, and narrative voice
- Stay at CEFR level ${difficulty} — ${cefrDesc}
- Use natural, everyday German

OUTPUT — valid JSON only, no markdown fences, no preamble:
{
  "sentences": [
    { "german": "...", "native": "...", "vocabWordsUsed": [] }
  ]
}`;
  }

  /** Target sentence count per length band — used by the extension flow to decide
   *  when a partial story has reached its full length. */
  targetCountForLength(length: StoryLength): number {
    const map: Record<StoryLength, number> = {
      'short':      12,
      'medium':     22,
      'long':       35,
      'very-long':  50,
      'extra-long': 65,
    };
    return map[length] ?? 22;
  }

  private buildVocabList(cards: CardEntity[]): string {
    return cards
      .map(c => `${c.content.article ? c.content.article + ' ' : ''}${c.content.back} = ${c.content.front}`)
      .join('\n');
  }

  private buildStandardPrompt(dto: GenerateStoryDto, cards: CardEntity[], nativeLanguage = 'English'): string {
    const vocabList = this.buildVocabList(cards);
    const cefrDesc = this.cefrDescriptions[dto.difficulty];
    const wordTarget = this.wordTargets[dto.length];

    return `You are a German language teacher creating a personalised story for an adult learner.

TASK: Write a ${wordTarget}-word German story that naturally incorporates the learner's vocabulary.

VOCABULARY LIST (use these words in the story — format: German = English):
${vocabList}

RULES:
1. Difficulty level: ${dto.difficulty} — ${cefrDesc}
2. Use at least 70% of the vocabulary words from the list above
3. Every vocabulary word must appear in a natural, everyday context — never artificially inserted
4. Write a complete narrative with a clear beginning, middle, and end
5. Include natural dialogue where it fits the story
6. Vocabulary words must appear in their correct grammatical form (correct article, conjugation, case)
7. The story must feel authentic — something a native German speaker would actually say or read
8. Do NOT add words outside the vocabulary list to meet a quota — only use them naturally

OUTPUT FORMAT — respond with valid JSON only, no markdown fences, no other text:
{
  "title": "Story title in German",
  "titleTranslation": "${nativeLanguage} translation of title",
  "sentences": [
    {
      "german": "German sentence.",
      "native": "${nativeLanguage} translation.",
      "vocabWordsUsed": ["word1", "word2"]
    }
  ]
}`;
  }

  private buildExtraLongPrompt(dto: GenerateStoryDto, cards: CardEntity[], nativeLanguage = 'English'): string {
    const vocabList = this.buildVocabList(cards);
    const cefrDesc = this.cefrDescriptions[dto.difficulty];

    return `You are writing a German learning podcast episode for an adult learner.

FORMAT: Write a 1100–1400 word German podcast-style narrative with:
- A brief introduction paragraph that sets the scene and welcomes the listener
- 2–3 scene transitions (marked with "— Szene 2 —" style headings in the sentence text)
- Natural spoken German — use contractions, ellipses, and conversational phrases where appropriate
- A concluding reflection paragraph that references the vocabulary themes
- Dialogue in direct speech throughout

VOCABULARY (use ≥70%):
${vocabList}

LEVEL: ${dto.difficulty} — ${cefrDesc}

OUTPUT — valid JSON only, no markdown fences, no other text:
{
  "title": "Podcast episode title in German",
  "titleTranslation": "${nativeLanguage} translation",
  "sentences": [
    { "german": "...", "native": "${nativeLanguage} translation.", "vocabWordsUsed": [] }
  ]
}`;
  }
}
