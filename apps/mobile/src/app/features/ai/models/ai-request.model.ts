import type { StoryDifficulty, StoryLength } from '@lingua-card/shared/domain';

export interface StoryGenerationConfig {
  prompt: string;
  maxTokens?: number;
}

export interface GeneratedStorySentence {
  german: string;
  english: string;
  vocabWordsUsed: string[];
}

export interface GeneratedStoryContent {
  title: string;
  titleTranslation: string;
  sentences: GeneratedStorySentence[];
}
