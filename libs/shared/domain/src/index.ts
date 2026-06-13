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
  imageUrl: string | null;
  phonetic: string | null;
  dictionaryWordId?: string | null;
}

export interface Card {
  id: string;
  deckId: string;
  collectionId: string | null;
  userId: string;
  contextId: string;
  /** Top-level provenance link — mirrors the DB column used for dedup joins. */
  dictionaryWordId?: string | null;
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
  /** Set when adopted from a platform collection (LC-405). */
  sourcePlatformCollectionId?: string | null;
  /** CEFR level from source platform collection (LC-405). */
  level?: string | null;
  /** Topic from source platform collection (LC-405). */
  topic?: string | null;
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

export interface VerbConjugations {
  praesens: Array<{ pronoun: string; form: string }>;
  praeteritum: Array<{ pronoun: string; form: string }>;
  perfekt?: string;    // e.g. "hat beraten"
  imperativ?: string;  // e.g. "berate! beratet!"
}

export interface StoryKeyword {
  cardId: string | null;       // null if not in user's vault
  german: string;              // "der Sternenhimmel" (with article)
  germanBase: string;          // "Sternenhimmel"
  english: string;             // "starry sky"
  article: 'der' | 'die' | 'das' | null;
  wordType: 'noun' | 'verb' | 'adjective' | 'adverb' | 'other';
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  conjugations?: VerbConjugations;
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
  article?: 'der' | 'die' | 'das' | null;
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

// ─── STORY STUDIO 2.0: PLATFORM STORIES ──────────────────────────────────────

export type StoryCategory =
  | 'daily-life'
  | 'travel'
  | 'food-culture'
  | 'work-career'
  | 'technology'
  | 'health-fitness'
  | 'education'
  | 'nature-environment'
  | 'entertainment'
  | 'fiction';

export const STORY_CATEGORIES: { value: StoryCategory; label: string; icon: string }[] = [
  { value: 'daily-life',        label: 'Daily Life',      icon: '🏠' },
  { value: 'travel',            label: 'Travel',          icon: '✈️' },
  { value: 'food-culture',      label: 'Food & Culture',  icon: '🍽️' },
  { value: 'work-career',       label: 'Work & Career',   icon: '💼' },
  { value: 'technology',        label: 'Technology',      icon: '💻' },
  { value: 'health-fitness',    label: 'Health & Fitness',icon: '🏃' },
  { value: 'education',         label: 'Education',       icon: '📚' },
  { value: 'nature-environment',label: 'Nature',          icon: '🌿' },
  { value: 'entertainment',     label: 'Entertainment',   icon: '🎬' },
  { value: 'fiction',           label: 'Fiction',         icon: '📖' },
];

export interface PlatformStory {
  id: string;
  title: string;
  titleTranslation: string;
  bodyDe: string;
  bodyEn: string;
  sentences: StorySentence[];
  wordTimestamps: WordTimestamp[];
  keywords: StoryKeyword[];
  quizQuestions: StoryQuizQuestion[];
  grammarNotes: StoryGrammarNote[];
  audioUrl: string | null;
  audioDurationMs: number;
  coverImageUrl: string;
  level: StoryDifficulty;
  category: StoryCategory;
  topics: string[];
  isFiction: boolean;
  isPremium: boolean;
  wordCount: number;
  estimatedReadMinutes: number;
  publishedAt: string;
  readCount: number;
}

/** Lightweight card for browse/list views — no body text or full data */
export interface PlatformStoryCard {
  id: string;
  title: string;
  titleTranslation: string;
  coverImageUrl: string;
  level: StoryDifficulty;
  category: StoryCategory;
  topics: string[];
  isFiction: boolean;
  isPremium: boolean;
  wordCount: number;
  estimatedReadMinutes: number;
  keywordCount: number;
  quizCount: number;
}

/** User's reading progress on a platform story */
export interface UserStoryProgress {
  storyId: string;
  userId: string;
  isRead: boolean;
  quizScore: number | null;
  lastReadAt: string | null;
  savedWordIds: string[];
}

/**
 * Calculate quiz question count based on story sentence count.
 * Minimum 5 for short stories, scales up for longer ones.
 * Formula: max(5, ceil(sentenceCount / 3))
 */
export function calculateQuizCount(sentenceCount: number): number {
  return Math.max(5, Math.ceil(sentenceCount / 3));
}

// ─── STUDY GOALS & REMINDERS ─────────────────────────────────────────────────

export interface StudyGoals {
  dailyGoal: number;
  weeklyGoal: number;
  monthlyGoal: number;
}

export interface ReminderSettings {
  remindersEnabled: boolean;
  reminderTime: string;
  timezone: string;
}

export interface UserSettings extends StudyGoals, ReminderSettings {
  userId: string;
  goalsSetAt: string | null;
}

export type UpdateUserSettingsDto = Partial<StudyGoals & ReminderSettings>;

export const DEFAULT_STUDY_GOALS: StudyGoals = {
  dailyGoal: 20,
  weeklyGoal: 120,
  monthlyGoal: 500,
};

export const DEFAULT_REMINDER_SETTINGS: Omit<ReminderSettings, 'timezone'> = {
  remindersEnabled: false,
  reminderTime: '19:00',
};

// ─── STREAK & GOAL PROGRESS ───────────────────────────────────────────────────

export type StreakState = 'safe' | 'at_risk' | 'broken';

export interface StreakStatus {
  current: number;
  longest: number;
  state: StreakState;
  lastGoalMetDate: string | null;
}

export interface GoalProgress {
  period: 'daily' | 'weekly' | 'monthly';
  reviewed: number;
  goal: number;
  metGoal: boolean;
}

// ─── WEB PUSH ────────────────────────────────────────────────────────────────

export interface PushSubscriptionDto {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
}

// ─── WORD DICTIONARY (LC-WD) ─────────────────────────────────────────────────

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
export type CollectionTopic = string;

export interface WordDictionaryEntry {
  id: string;
  lemmaKey: string;
  displayText: string;
  article: 'der' | 'die' | 'das' | null;
  gender: GenderType;
  translation: string;
  wordType: 'noun' | 'verb' | 'adjective' | 'adverb' | 'other';
  phonetic: string | null;
  cefrLevel: CefrLevel | null;
  categoryName: string;
  examples: ExampleSentence[];
  synonyms: Synonym[];
  plurals: string[];
  wordAudioId: string | null;
  targetLang: string;
  nativeLang: string;
  source: 'ai-enrich' | 'admin' | 'story-extract';
  model: string | null;
  enrichedAt: string;
}

export interface RawWordInput {
  back: string;
  article: 'der' | 'die' | 'das' | null;
}

export interface DictionaryLookupRequest {
  text: string;
  article?: string | null;
  targetLang?: string;
  nativeLang?: string;
}

export interface DictionaryResolveResult {
  entry: WordDictionaryEntry;
  reused: boolean;
}

export interface DictionaryBatchResolveResult {
  entries: WordDictionaryEntry[];
  reused: number;
  enriched: number;
}

// Admin DTOs

export interface AdminImportCollectionDto {
  level: CefrLevel;
  topic: CollectionTopic;
  title: string;
  emoji?: string;
  words: RawWordInput[];
  reuseExisting?: boolean;
}

export interface AdminImportCollectionResult {
  collectionId: string;
  title: string;
  created: number;
  reused: number;
  enriched: number;
}

export interface GeneratedPlatformStorySentence {
  german: string;
  english: string;
  wordsUsed: string[];
}

export interface GeneratedPlatformStoryKeyword {
  germanBase: string;
  article: 'der' | 'die' | 'das' | null;
  english: string;
  wordType: 'noun' | 'verb' | 'adjective' | 'adverb' | 'other';
  level: CefrLevel;
}

export interface GeneratedPlatformStory {
  title: string;
  titleTranslation: string;
  level: CefrLevel;
  topic: CollectionTopic;
  sentences: GeneratedPlatformStorySentence[];
  keywords: GeneratedPlatformStoryKeyword[];
}

export interface AdminImportStoryDto {
  platformCollectionId: string;
  story: GeneratedPlatformStory;
  isFiction?: boolean;
}

export interface AdminImportStoryResult {
  storyId: string;
  title: string;
  sentenceCount: number;
  keywordsResolved: number;
}

// Pre-enriched word — no AI call needed, audio resolved server-side
export interface EnrichedWordInput {
  back: string;
  article: 'der' | 'die' | 'das' | null;
  front: string;
  plural?: string | null;
  phonetic?: string | null;
  cefrLevel?: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | null;
  categoryName?: string;
  examples?: Array<{ target: string; native: string }>;
  synonyms?: Array<{ word: string; article?: string | null; translation: string; example?: string; exampleNative?: string }>;
  wordType?: 'noun' | 'verb' | 'adjective' | 'adverb' | 'other';
}

export interface AdminImportCollectionJsonDto {
  title: string;
  level: CefrLevel;
  topic: CollectionTopic;
  emoji?: string;
  words: EnrichedWordInput[];
}

export interface AdminImportCollectionJsonResult {
  collectionId: string;
  title: string;
  inserted: number;
  reused: number;
  audioLinked: number;
}

export interface AdminPlatformCollectionListItem {
  id: string;
  title: string;
  emoji: string | null;
  level: string;
  topic: string;
  wordCount: number;
  dictionaryLinked: number;
  isPublished: boolean;
  /** Admin-set story category for deterministic story pairing (LC-414). */
  storyCategory: string | null;
  createdAt: string;
}

export interface AdminPublishToggleDto {
  isPublished: boolean;
}

export interface AdminSetStoryCategoryDto {
  /** Enum value matching StoryCategory, or null to clear the pairing. */
  storyCategory: string | null;
}

// ─── PLATFORM COLLECTIONS — PUBLIC (LC-403a) ─────────────────────────────────

export type PlatformCollectionAdoptionStatus = 'not-adopted' | 'adopted';

export interface PlatformCollectionSummary {
  id: string;
  title: string;
  emoji: string | null;
  level: CefrLevel;
  topic: string;
  wordCount: number;
  /** Exact count of this set's words that already exist in the user's vault (dictionaryWordId join). */
  knownCount: number;
  adoptionStatus: PlatformCollectionAdoptionStatus;
  /** ID of the user's Collection entity if already adopted, null otherwise. */
  adoptedCollectionId: string | null;
}

export interface PlatformCollectionWordView {
  dictionaryWordId: string;
  displayText: string;
  article: 'der' | 'die' | 'das' | null;
  translation: string;
  wordType: string;
  cefrLevel: CefrLevel | null;
  exampleTarget: string | null;
  exampleNative: string | null;
  /** True if the user already owns a card linked to this dictionary word. */
  knownToUser: boolean;
}

export interface PlatformCollectionDetail extends PlatformCollectionSummary {
  words: PlatformCollectionWordView[];
  /** Related platform stories matched by level + storyCategory. Empty when storyCategory is unset. */
  relatedStories: PlatformStoryCard[];
}

export interface PlatformCollectionListResponse {
  collections: PlatformCollectionSummary[];
  levelCounts: Record<CefrLevel, number>;
  /** Mode of cefrLevel across user's dictionary-linked cards; 'A1' for empty vaults. */
  suggestedLevel: CefrLevel;
}

export interface AdoptPlatformCollectionDto {
  /** No request body required — user identity comes from JWT. */
  _?: never;
}

export interface AdoptPlatformCollectionResult {
  collection: Collection;
  addedCount: number;
  skippedCount: number;
}
