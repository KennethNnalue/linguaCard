// ─── PRIMITIVE TYPES ─────────────────────────────────────────────────────────

export type LanguageCode = 'en' | 'de' | 'fr' | 'es' | 'it' | 'pt' | 'ja' | 'zh' | 'ko' | 'ar';
export type GenderType = 'masculine' | 'feminine' | 'neuter' | null;
export type ArticleType = 'der' | 'die' | 'das' | 'le' | 'la' | 'el' | 'un' | 'une' | null;
export type MasteryLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type SRSState = 'new' | 'learning' | 'review' | 'relearning' | 'mastered';
export type ConfidenceRating = 1 | 2 | 3 | 4;
export type ThemeMode = 'light' | 'dark' | 'system';
export type PlaylistType = 'word-meaning' | 'examples-only' | 'deep-dive';
export type ReviewMode = 'flashcard' | 'listen' | 'cloze' | 'write';
export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'error';
export type PlayMode = 'compact' | 'examples' | 'deepDive';
export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error' | 'complete';

export type SegmentType =
  | 'word_target'
  | 'word_native'
  | 'example_target'
  | 'example_native'
  | 'grammar_tip'
  | 'silence';

export interface AudioSegment {
  type: SegmentType;
  text: string;
  lang: 'de' | 'en';
  durationMs?: number;
}

export interface PlaybackScript {
  cardId: string;
  segments: AudioSegment[];
}

export interface PlayerSettings {
  playMode: PlayMode;
  speed: 0.75 | 0.95 | 1 | 1.25 | 1.5;
  shuffle: boolean;
  repeat: boolean;
}

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

  /** 'fsrs' after migration; 'sm2' for un-migrated rows. */
  algorithm: 'sm2' | 'fsrs';

  // ─── Scheduling fields (used by both algorithms) ──────────────────────────
  intervalDays: number;
  nextDueAt: string;
  lastReviewedAt: string | null;
  lastRating: ConfidenceRating | null;
  masteryLevel: MasteryLevel;

  /** 'relearning' replaces SM-2's reset-to-zero on failure. */
  state: SRSState;

  // ─── FSRS-specific fields (null for SM-2 rows until migration runs) ────────
  /** Days until recall probability drops to target retention. Null before first FSRS review. */
  stability: number | null;
  /** Intrinsic hardness 1–10, updated each review. Null before first FSRS review. */
  difficulty: number | null;
  /** Current recall probability 0–1. Null before first FSRS review. */
  retrievability: number | null;

  // ─── SM-2 legacy fields (kept during migration, removed in cleanup) ────────
  /** @deprecated Use stability instead. Kept for SM-2 rows. */
  easeFactor: number;
  /** @deprecated Not used by FSRS. Kept for SM-2 rows. */
  repetitions: number;
}

// ─── MEDIA ────────────────────────────────────────────────────────────────────

/** @deprecated Will be superseded by WordAudio in the Global Word Audio Registry epic */
export interface AudioAsset {
  id: string;
  url: string;
  type: 'recording' | 'tts';
  language: LanguageCode;
  text: string;
  durationSeconds: number;
}

// ─── WORD AUDIO REGISTRY ──────────────────────────────────────────────────────

export type WordAudioStatus = 'pending' | 'ready' | 'failed';

export interface WordAudio {
  id: string;
  normalizedText: string;
  displayText: string;
  language: string;
  audioUrl: string | null;
  storagePath: string | null;
  durationMs: number;
  status: WordAudioStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WordAudioResolveRequest {
  text: string;
  language?: string;
}

export interface WordAudioResolveResponse {
  wordAudio: WordAudio;
  /** true if audio already existed — no TTS call was made */
  cached: boolean;
  /** set when generation was blocked by rate limit — client should back off for this many ms */
  retryAfterMs?: number;
}

export interface WordAudioBatchResolveRequest {
  words: WordAudioResolveRequest[];
}

export interface WordAudioBatchResolveResponse {
  results: WordAudioResolveResponse[];
  generated: number;
  reused: number;
}

export interface DuplicateCheckWord {
  back: string;
  article?: string | null;
}

export interface DuplicateCheckResult {
  input: DuplicateCheckWord;
  existingCard: {
    id: string;
    back: string;
    article: string | null;
    collectionId: string | null;
    collectionName: string | null;
  } | null;
}

// ─── CARD ─────────────────────────────────────────────────────────────────────

export interface ExampleSentence {
  id: string;
  target: string;
  native: string;
}

export interface Synonym {
  /** Synonym headword in the target language, WITHOUT article (e.g. "Maschine"). */
  word: string;
  /** Grammatical article, or null for non-nouns. */
  article: ArticleType | null;
  /** Native-language translation of the synonym. */
  translation: string;
  /** A natural target-language sentence using the synonym. May be ''. */
  example: string;
  /** Native-language translation of the example. May be ''. */
  exampleNative: string;
}

export interface CardContent {
  front: string;
  back: string;
  article: ArticleType | null;
  gender: GenderType;
  /** Full plural form INCLUDING its article, e.g. "die Flugzeuge". null for non-nouns or unknown. */
  plural: string | null;
  examples: ExampleSentence[];
  /** True synonyms of the headword, generated by AI enrichment. Defaults to []. */
  synonyms: Synonym[];
  notes: string;
  /** @deprecated Will be replaced by wordAudioId (Global Word Audio Registry) */
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
  isDefault: boolean;
  importStatus: CollectionImportStatus;
  pendingWords: RawExtractedWord[];
  sourceImageDescription?: string;
  createdAt: string;
  updatedAt: string;
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

/**
 * Server-side / API shape for a completed review session.
 * `reviewedCards` is a count (number), not an array.
 * Do NOT confuse with `LocalReviewSession` in the mobile app which holds the
 * full `Card[]` array for in-process and history display.
 */
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
  type:
    | 'CREATE_CARD'
    | 'UPDATE_CARD'
    | 'DELETE_CARD'
    | 'RATE_CARD'
    | 'CREATE_CATEGORY'
    | 'CREATE_COLLECTION'
    | 'UPDATE_COLLECTION'
    | 'DELETE_COLLECTION'
    | 'FLUSH_SRS_RATINGS';
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
  /** Populated only for image-import rows that went through AI enrichment. */
  plural?: string | null;
  synonyms?: Synonym[];
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

export interface StoryQuizQuestion {
  id: string;
  sentenceTemplate: string;    // "Man kann auch unter ___ Sternenhimmel schlafen."
  correctAnswer: string;       // "dem"
  distractors: string[];       // ["das", "den"]  (2 distractors → 3 choices total)
  audioSentence?: string;      // full sentence text for TTS playback
  hint?: string;               // grammar hint shown after wrong answer
}

export interface StoryGrammarNote {
  id: string;
  title: string;               // "Modal verb \"können\""
  exampleDe: string;           // Story sentence used as example
  exampleEn: string;           // English translation of example
  description: string;         // Multi-paragraph plain text explanation
  conjugationTable?: Array<{ pronoun: string; form: string }>;
  additionalExamples: Array<{ de: string; en: string }>;
}

export interface StoryKeyword {
  cardId: string | null;       // null if not in user's vault
  german: string;              // "der Sternenhimmel" (with article)
  germanBase: string;          // "Sternenhimmel"
  english: string;             // "starry sky"
  article: 'der' | 'die' | 'das' | null;
  wordType: 'noun' | 'verb' | 'adjective' | 'adverb' | 'other';
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
}

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
export type AIProviderType = 'anthropic' | 'openai' | 'gemini' | 'openrouter';

// ─── RESILIENT STORY GENERATION ──────────────────────────────────────────────

/**
 * 'complete'  — all sentences generated and saved successfully.
 * 'partial'   — JSON parse failed or token limit hit; some sentences saved,
 *               story can be extended via POST /stories/:id/extend.
 * 'extending' — client-side transient state: an extend request is in flight.
 *               Never stored in the DB; set locally in StoryStore only.
 */
export type StoryGenerationStatus = 'complete' | 'partial' | 'extending';

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
  coverImageUrl?: string | null;
  quizQuestions?: StoryQuizQuestion[];
  grammarNotes?: StoryGrammarNote[];
  keywords?: StoryKeyword[];
  isLearned?: boolean;
  modelUsed?: string | null;
  generationStatus: StoryGenerationStatus;
}

export interface GenerateStoryDto {
  collectionIds: string[];
  length: StoryLength;
  difficulty: StoryDifficulty;
  provider?: AIProviderType;
}

// ─── IMAGE IMPORT ─────────────────────────────────────────────────────────────

export interface ImageExtractedWord {
  front: string;
  back: string;
  article: ArticleType | null;
  plural: string | null;
  categoryName: string;
  exampleTarget: string;
  exampleNative: string;
  synonyms: Synonym[];
  confidence: number;
  boundingBoxHint?: string;
}

export interface EnrichOneRequest {
  back: string;
  targetLanguage: string;
  nativeLanguage: string;
}

export type EnrichOneResult = ImageExtractedWord;

export interface ImageImportRequest {
  imageBase64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  targetLanguage: string;
  nativeLanguage: string;
  userId: string;
  contextId: string;
}

export interface ImageImportResult {
  words: ImageExtractedWord[];
  totalFound: number;
  imageDescription: string;
  processingMs: number;
  modelUsed: string;
}

// ─── RESILIENT IMAGE IMPORT (LC-103) ──────────────────────────────────────────

export type CollectionImportStatus = 'complete' | 'incomplete';

/** A word exactly as seen in the image — no translation yet */
export interface RawExtractedWord {
  back: string;
  article: ArticleType | null;
  rawText: string;
}

/** Phase 1 response — raw words only, no enrichment */
export interface WordExtractionResult {
  rawWords: RawExtractedWord[];
  totalFound: number;
  imageDescription: string;
  processingMs: number;
  modelUsed: string;
}

/** Phase 2 request — enrich raw words into full card data */
export interface EnrichWordsRequest {
  rawWords: RawExtractedWord[];
  targetLanguage: string;
  nativeLanguage: string;
  collectionId?: string;
  batchSize?: number;
}

/** Phase 2 response — what was enriched vs what is still pending */
export interface EnrichWordsResult {
  enriched: ImageExtractedWord[];
  pending: RawExtractedWord[];
  isComplete: boolean;
}

// ─── SUBSCRIPTIONS ────────────────────────────────────────────────────────────

export type SubscriptionTier = 'free' | 'pro';

export interface Subscription {
  id: string;
  userId: string;
  tier: SubscriptionTier;
  activatedAt: string | null;
  expiresAt:   string | null;
  createdAt:   string;
}

export interface SubscriptionStatus {
  tier:                  SubscriptionTier;
  isActive:              boolean;
  storiesGenerated:      number;
  storiesRemaining:      number | null;
  freeStoryLimit:        number;
  imageImportsUsed:      number;
  imageImportsRemaining: number | null;
  freeImageImportLimit:  number;
}

// ─── CONTACT / UPGRADE ───────────────────────────────────────────────────────

export interface UpgradeRequestDto {
  name:    string;
  email:   string;
  message: string;
}
