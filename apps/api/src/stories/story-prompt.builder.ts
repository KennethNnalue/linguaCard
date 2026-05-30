import { Injectable } from '@nestjs/common';
import type { GenerateStoryDto, StoryDifficulty, StoryLength } from '@lingua-card/shared/domain';
import type { CardEntity } from '../cards/card.entity';

@Injectable()
export class StoryPromptBuilder {
  private readonly wordTargets: Record<StoryLength, string> = {
    'short': '80–150',
    'medium': '200–320',
    'long': '400–520',
    'very-long': '700–900',
    'extra-long': '1100–1400',
  };

  private readonly cefrDescriptions: Record<StoryDifficulty, string> = {
    'A1': 'extremely simple, present tense only, 3–5 word sentences, most basic vocabulary',
    'A2': 'simple present and past tense, basic vocabulary, short sentences, everyday topics',
    'B1': 'mix of tenses, subordinate clauses, broader vocabulary, narrative structure',
    'B2': 'complex sentences, passive voice, nuanced vocabulary, varied register, subjunctive mood',
  };

  build(dto: GenerateStoryDto, cards: CardEntity[]): string {
    if (dto.length === 'extra-long') {
      return this.buildExtraLongPrompt(dto, cards);
    }
    return this.buildStandardPrompt(dto, cards);
  }

  private buildVocabList(cards: CardEntity[]): string {
    return cards
      .map(c => `${c.content.article ? c.content.article + ' ' : ''}${c.content.back} = ${c.content.front}`)
      .join('\n');
  }

  private buildStandardPrompt(dto: GenerateStoryDto, cards: CardEntity[]): string {
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
  "titleTranslation": "English translation of title",
  "sentences": [
    {
      "german": "German sentence.",
      "english": "English translation.",
      "vocabWordsUsed": ["word1", "word2"]
    }
  ]
}`;
  }

  private buildExtraLongPrompt(dto: GenerateStoryDto, cards: CardEntity[]): string {
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
  "titleTranslation": "English translation",
  "sentences": [
    { "german": "...", "english": "...", "vocabWordsUsed": [] }
  ]
}`;
  }
}
