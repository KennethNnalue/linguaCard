// ─── PRIMITIVE TYPES ─────────────────────────────────────────────────────────

export type LanguageCode = 'en' | 'de' | 'fr' | 'es' | 'it' | 'pt' | 'ja' | 'zh' | 'ko' | 'ar';
export type GenderType = 'masculine' | 'feminine' | 'neuter' | null;
export type ArticleType = 'der' | 'die' | 'das' | 'le' | 'la' | 'el' | 'un' | 'une' | null;
export type MasteryLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type SRSState = 'new' | 'learning' | 'review' | 'mastered';
export type ConfidenceRating = 0 | 1 | 2 | 3 | 4 | 5;
export type ThemeMode = 'light' | 'dark' | 'system';
export type PlaylistType = 'word-meaning' | 'examples-only' | 'deep-dive';
export type ReviewMode = 'flashcard' | 'listen' | 'cloze' | 'write';
export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'error';

// ─── ARTICLE COLOUR SYSTEM ────────────────────────────────────────────────────

export interface ArticleColourConfig {
  article: string;
  gender: GenderType;
  bgColour: string;
  textColour: string;
  borderColour: string;
  cssClass: string;
}

export interface ArticleSystem {
  language: LanguageCode;
  articles: ArticleColourConfig[];
}

// ─── LEARNING CONTEXT ─────────────────────────────────────────────────────────

export interface LearningContext {
  id: string;
  name: string;
  description: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  flagEmoji: string;
  articleSystem: ArticleSystem | null;
  ttsVoice: string;
  defaultSRSConfig: SRSConfig;
}

// ─── SRS ──────────────────────────────────────────────────────────────────────

export interface SRSConfig {
  algorithm: 'sm2' | 'fsrs' | 'leitner';
  newCardsPerDay: number;
  reviewsPerDay: number;
  intervalModifier: number;
  easeBonus: number;
  hardInterval: number;
  minimumEaseFactor: number;
  startingEaseFactor: number;
}

export interface SRSStateData {
  id: string;
  cardId: string;
  userId: string;
  algorithm: string;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lastRating: ConfidenceRating | null;
  lastReviewedAt: string | null;
  nextDueAt: string;
  masteryLevel: MasteryLevel;
  state: SRSState;
}

// ─── MEDIA ────────────────────────────────────────────────────────────────────

export interface AudioAsset {
  id: string;
  url: string;
  type: 'recording' | 'tts';
  language: LanguageCode;
  text: string;
  durationSeconds: number;
}

// ─── CARD ─────────────────────────────────────────────────────────────────────

export interface ExampleSentence {
  id: string;
  target: string;
  native: string;
}

export interface CardContent {
  front: string;
  back: string;
  article: ArticleType | null;
  gender: GenderType;
  examples: ExampleSentence[];
  notes: string;
  audioAssetId: string | null;
  imageUrl: string | null;
  phonetic: string | null;
}

export interface Card {
  id: string;
  deckId: string;
  collectionId: string | null;
  userId: string;
  contextId: string;
  content: CardContent;
  categoryIds: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
  srsState?: SRSStateData;
}

// ─── CATEGORY ─────────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  userId: string;
  name: string;
  colour: string;
  cardCount: number;
  createdAt: string;
}

// ─── DECK ─────────────────────────────────────────────────────────────────────

export interface Deck {
  id: string;
  userId: string;
  contextId: string;
  name: string;
  description: string;
  cardCount: number;
  isDefault: boolean;
  createdAt: string;
}

// ─── COLLECTION ───────────────────────────────────────────────────────────────

export interface CreateCollectionDto {
  name: string;
  emoji?: string;
  colour?: string;
  contextId: string;
  description?: string;
}

export interface UpdateCollectionDto {
  name?: string;
  emoji?: string;
  colour?: string;
  description?: string;
}

export interface Collection {
  id: string;
  userId: string;
  name: string;
  description: string;
  emoji: string;
  colour: string;
  contextId: string;
  cardCount: number;
  masteredCount: number;
  dueCount: number;
  createdAt: string;
  updatedAt: string;
  isDefault: boolean;
}

// ─── USER ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  avatarInitials: string;
  createdAt: string;
}

export interface UserPreferences {
  userId: string;
  theme: ThemeMode;
  activeContextId: string;
  autoPlayAudio: boolean;
  playbackSpeed: number;
  showPhonetics: boolean;
  dailyGoalCards: number;
  notificationsEnabled: boolean;
  reminderTime: string;
}

// ─── PROGRESS ─────────────────────────────────────────────────────────────────

export interface DayActivity {
  date: string;
  reviewed: number;
  newAdded: number;
}

export interface ProgressStats {
  totalCards: number;
  masteredCards: number;
  learningCards: number;
  newCards: number;
  dayStreak: number;
  reviewedToday: number;
  dueToday: number;
  dueThisWeek: number;
  averageRating: number;
  totalReviewSessions: number;
  longestStreak: number;
  weeklyActivity: DayActivity[];
}

// ─── REVIEW SESSION ───────────────────────────────────────────────────────────

export interface ReviewSession {
  id: string;
  userId: string;
  deckId: string;
  startedAt: string;
  completedAt: string | null;
  totalCards: number;
  reviewedCards: number;
  newCards: number;
  ratings: Record<string, ConfidenceRating>;
}

// ─── SYNC ─────────────────────────────────────────────────────────────────────

export interface SyncOperation {
  id: string;
  type: 'CREATE_CARD' | 'UPDATE_CARD' | 'DELETE_CARD' | 'RATE_CARD' | 'CREATE_CATEGORY';
  payload: unknown;
  createdAt: string;
  retryCount: number;
  status: 'pending' | 'processing' | 'failed';
}

// ─── PAGINATION ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
}

// ─── IMPORT ───────────────────────────────────────────────────────────────────

export interface ParsedImportRow {
  rowIndex: number;
  front: string;
  back: string;
  article: ArticleType | null;
  categoryId: string;
  exampleTarget: string;
  exampleNative: string;
  status: 'valid' | 'warning' | 'error';
  warningMessages: string[];
  errorMessages: string[];
}

export interface ParsedImportResult {
  fileName: string;
  totalRows: number;
  validRows: ParsedImportRow[];
  errorRows: ParsedImportRow[];
  warningCount: number;
}

export interface BulkCreateResult {
  created: number;
  failed: number;
  cards: Card[];
  error?: string;
}

// ─── STORY STUDIO ─────────────────────────────────────────────────────────────

export interface StorySentence {
  index: number;
  german: string;
  english: string;
  vocabWordIds: string[];
}

export interface WordTimestamp {
  word: string;
  startMs: number;
  endMs: number;
  isVocab: boolean;
  cardId?: string;
}

export interface StoryVocabWord {
  cardId: string;
  german: string;
  germanBase: string;
  english: string;
  article: 'der' | 'die' | 'das' | null;
  sentenceIndices: number[];
}

export type StoryDifficulty = 'A1' | 'A2' | 'B1' | 'B2';
export type StoryLength = 'short' | 'medium' | 'long' | 'very-long' | 'extra-long';
export type AIProviderType = 'anthropic' | 'openai' | 'gemini';

export interface PronunciationRequest {
  cardId: string;
  word: string;
  language: string;
  voice?: string;
}

export interface Story {
  id: string;
  userId: string;
  title: string;
  titleTranslation: string;
  bodyDe: string;
  bodyEn: string;
  sentences: StorySentence[];
  wordTimestamps: WordTimestamp[];
  vocabWords: StoryVocabWord[];
  audioUrl: string | null;
  audioDurationMs: number;
  sourceCollectionIds: string[];
  difficultyLevel: StoryDifficulty;
  lengthType: StoryLength;
  listenCount: number;
  lastListenedAt: string | null;
  generatedAt: string;
}

export interface GenerateStoryDto {
  collectionIds: string[];
  length: StoryLength;
  difficulty: StoryDifficulty;
  provider?: AIProviderType;
}
