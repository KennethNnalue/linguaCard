import type { ReviewSchedulingState } from '@lingua-card/shared/domain';

export interface LearningItemCursor {
  createdAt: string;
  id: string;
}

export interface LearningItemExampleRow {
  id: string;
  targetText: string;
  sourceText: string | null;
}

export interface LearningItemReadRow {
  id: string;
  learningContextId: string;
  sourceLanguage: string;
  targetLanguage: string;
  lexemeId: string;
  lexemeText: string;
  partOfSpeech: string;
  grammar: Record<string, unknown>;
  phonetic: string | null;
  localizationLanguage: string;
  translation: string;
  definition: string | null;
  examples: LearningItemExampleRow[];
  personalNote: string;
  reviewState: ReviewSchedulingState | null;
  collectionIds: string[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CollectionSummaryRow {
  id: string;
  learningContextId: string;
  name: string;
  description: string;
  coverSeed: string;
  coverImageUrl: string | null;
  level: string | null;
  topic: string | null;
  itemCount: number;
  masteredCount: number;
  dueCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}
