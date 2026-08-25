export type TextDirection = 'ltr' | 'rtl';
export type SpeechPolicy = 'synthesized' | 'device';
export type VocabularySource = 'ai-enrich' | 'admin' | 'story-extract' | 'migration' | 'user';
export type LocalizationStatus = 'pending' | 'ready' | 'failed' | 'needs_review';
export type SpeechAssetStatus = 'pending' | 'generating' | 'ready' | 'failed';
export type SpeechContentKind = 'word' | 'example' | 'sentence';

export interface LexemeGrammar {
  article: string | null;
  gender: string | null;
  plurals: string[];
}

export interface LegacyVocabularySynonymInput {
  word: string;
  article: string | null;
  translation: string;
  example: string;
  exampleNative: string;
}

export interface LexemeIdentityInput {
  language: string;
  text: string;
  partOfSpeech?: string;
  grammar?: Readonly<Record<string, unknown>>;
}

export interface LexemeIdentity {
  language: string;
  normalizedLemma: string;
  displayText: string;
  partOfSpeech: string;
  grammarDiscriminator: string;
}

export interface SpeechIdentityInput {
  language: string;
  text: string;
  voiceKey: string;
  profileVersion: number;
  contentKind: SpeechContentKind;
}

export interface SpeechIdentity {
  identityKey: string;
  language: string;
  normalizedText: string;
  displayText: string;
  voiceKey: string;
  profileVersion: number;
  contentKind: SpeechContentKind;
}

export interface LegacyVocabularyExampleInput {
  target: string;
  source: string;
}

export interface LegacyVocabularyProjectionInput {
  targetLanguage: string;
  sourceLanguage: string;
  displayText: string;
  article: string | null;
  gender: string | null;
  translation: string;
  definition?: string | null;
  partOfSpeech: string;
  phonetic: string | null;
  cefrLevel: string | null;
  plurals: readonly string[];
  examples: readonly LegacyVocabularyExampleInput[];
  synonyms: readonly LegacyVocabularySynonymInput[];
  source: VocabularySource;
  model: string | null;
}

export interface VocabularyProjectionResult {
  lexemeId: string;
  localizationId: string;
  exampleCount: number;
}

export interface LegacySpeechAssetProjectionInput {
  language: string;
  text: string;
  audioUrl: string | null;
  storagePath: string | null;
  durationMs: number;
  status: 'pending' | 'ready' | 'failed';
  failedAt: Date | null;
}
