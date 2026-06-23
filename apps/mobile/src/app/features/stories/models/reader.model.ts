import type { StoryQuizQuestion, VerbConjugations } from '@lingua-card/shared/domain';

/** Reader tab identifiers shared by the user-story and platform-story readers. */
export type ReaderTab = 'story' | 'quiz' | 'keywords' | 'grammar';

/** A single rendered token within a sentence. */
export interface WordToken {
  text: string;
  isVocab: boolean;
  wordIdx: number; // index within the sentence token array
}

/** The word the user tapped in the story text. */
export interface TappedWord {
  sentenceIdx: number;
  wordIdx: number;
  word: string; // raw token text (may include punctuation)
  base: string; // stripped form used for vocab lookup
  isVocab: boolean;
}

/** Resolved detail for the tapped word, shown in the word sheet. */
export interface WordDetail {
  display: string; // "der Mensch" or "beraten"
  base: string; // "Mensch"
  english: string;
  article: 'der' | 'die' | 'das' | null;
  wordType: 'noun' | 'verb' | 'adjective' | 'adverb' | 'other' | null;
  plural: string | null; // "die Menschen" — from vault card if available
  cardId: string | null; // null if not in vault
  conjugations: VerbConjugations | null;
}

/** Half-open [start, end) timestamp-index range for a sentence. */
export interface SentenceWordRange {
  start: number;
  end: number;
}

/** Result of scoring a quiz given the user's answers. */
export interface QuizScore {
  correct: number;
  total: number;
  /** True when the user answered at least one question. */
  attempted: boolean;
}

/**
 * Score a quiz from the question set and the user's chosen answers
 * (keyed by question id). Shared by both readers' completion flows.
 */
export function computeQuizScore(
  questions: readonly StoryQuizQuestion[],
  answered: Readonly<Record<string, string>>,
): QuizScore {
  const total = questions.length;
  const attempted = Object.keys(answered).length > 0;
  if (total === 0 || !attempted) {
    return { correct: 0, total, attempted: false };
  }
  const correct = questions.reduce((n, q) => {
    const chosen = answered[q.id];
    return n + (chosen && chosen === q.correctAnswer ? 1 : 0);
  }, 0);
  return { correct, total, attempted: true };
}
