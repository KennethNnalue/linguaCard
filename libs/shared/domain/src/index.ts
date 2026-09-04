// ─── PRIMITIVE TYPES ─────────────────────────────────────────────────────────

export type LanguageCode = 'en' | 'de' | 'fr' | 'es' | 'it' | 'pt' | 'ja' | 'zh' | 'ko' | 'ar' | 'uk' | 'tr' | 'ru';
export type GenderType = 'masculine' | 'feminine' | 'neuter' | null;
export type ArticleType = 'der' | 'die' | 'das' | 'le' | 'la' | 'el' | 'un' | 'une' | null;
export type LearningStage = 'new' | 'learning' | 'familiar' | 'strong' | 'mastered';
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';
export type ThemeMode = 'light' | 'dark' | 'system';
export type OnboardingMotivation = 'travel' | 'work' | 'family' | 'culture' | 'exams';
export type OnboardingLevel = 'beginner' | 'some' | 'intermediate';
export type PlaylistType = 'words' | 'words-with-examples';
export type ReviewMode = 'flashcard' | 'listen' | 'cloze' | 'write';
export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'error';
export type PlayMode = 'words' | 'wordsWithExamples';
export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error' | 'complete';

export const STREAK_FREEZE_GOAL_INTERVAL = 7;
export const MAX_STREAK_FREEZE_INVENTORY = 2;
export const DAILY_STREAK_POLICY_VERSION = 1;
export const DAILY_STREAK_REVIEW_TARGET = 10;

export interface DailyStreakPolicy {
  version: number;
  requiredUniqueReviews: number;
}

export const DAILY_STREAK_POLICY: Readonly<DailyStreakPolicy> = {
  version: DAILY_STREAK_POLICY_VERSION,
  requiredUniqueReviews: DAILY_STREAK_REVIEW_TARGET,
};

export const REVIEW_LEARNING_POINTS = {
  firstUniqueDailyReview: 2,
  recoveredRecall: 1,
  dailyStreakCompleted: 10,
  cardMastered: 5,
} as const;

export const PODCAST_COMPLETION_POINTS = 10;
export const PODCAST_COMPLETION_LISTENING_RATIO = 0.7;
export const PODCAST_WORD_RETRIEVAL_POINTS = 3;
export const COLLECTION_LISTENING_POINTS = 5;
export const STORY_COMPLETION_POINTS = 8;

export function dailyStreakReviewTarget(eligibleCardCount: number): number {
  if (!Number.isInteger(eligibleCardCount) || eligibleCardCount < 1) {
    throw new Error('Eligible card count must be a positive integer');
  }
  return Math.min(DAILY_STREAK_POLICY.requiredUniqueReviews, eligibleCardCount);
}

export function streakFreezeGrantMilestone(
  qualifyingGoalDayCount: number,
  currentInventory: number,
): number | null {
  if (!Number.isInteger(qualifyingGoalDayCount) || qualifyingGoalDayCount < 1) return null;
  if (!Number.isInteger(currentInventory) || currentInventory < 0) return null;
  if (currentInventory >= MAX_STREAK_FREEZE_INVENTORY) return null;
  if (qualifyingGoalDayCount % STREAK_FREEZE_GOAL_INTERVAL !== 0) return null;
  return qualifyingGoalDayCount / STREAK_FREEZE_GOAL_INTERVAL;
}

export interface StreakFreezeLedgerDay {
  dayKey: string;
  reviewed: number;
  goal: number;
}

export interface StreakFreezeLedgerEntry {
  amount: number;
  reason: 'granted' | 'consumed' | 'revoked' | 'expired';
  occurredDayKey: string;
  protectedDayKey?: string;
}

function adjacentDayKey(value: string, offset: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function planStreakFreezeProtectionDays(input: {
  todayKey: string;
  firstTrackedDayKey: string | null;
  progress: readonly StreakFreezeLedgerDay[];
  transactions: readonly StreakFreezeLedgerEntry[];
}): readonly string[] {
  if (!input.firstTrackedDayKey) return [];
  const yesterdayKey = adjacentDayKey(input.todayKey, -1);
  if (input.firstTrackedDayKey > yesterdayKey) return [];

  const progressByDay = new Map(input.progress.map(day => [day.dayKey, day]));
  const inventoryChanges = input.transactions
    .filter(transaction => transaction.reason !== 'consumed')
    .sort((left, right) => left.occurredDayKey.localeCompare(right.occurredDayKey));
  const consumptionByDay = new Map<string, number>();
  for (const transaction of input.transactions) {
    if (transaction.reason !== 'consumed' || !transaction.protectedDayKey) continue;
    consumptionByDay.set(
      transaction.protectedDayKey,
      (consumptionByDay.get(transaction.protectedDayKey) ?? 0) + transaction.amount,
    );
  }

  const planned: string[] = [];
  let inventory = 0;
  let inventoryChangeIndex = 0;
  for (
    let dayKey = input.firstTrackedDayKey;
    dayKey <= yesterdayKey;
    dayKey = adjacentDayKey(dayKey, 1)
  ) {
    while (
      inventoryChangeIndex < inventoryChanges.length
      && inventoryChanges[inventoryChangeIndex].occurredDayKey <= dayKey
    ) {
      inventory += inventoryChanges[inventoryChangeIndex].amount;
      inventoryChangeIndex += 1;
    }

    const existingConsumption = consumptionByDay.get(dayKey);
    if (existingConsumption !== undefined) {
      inventory += existingConsumption;
      continue;
    }

    const progress = progressByDay.get(dayKey);
    if (progress && progress.reviewed >= progress.goal) continue;
    if (inventory < 1) continue;

    planned.push(dayKey);
    inventory -= 1;
  }
  return planned;
}

export type SegmentType =
  | 'word_target'
  | 'word_native'
  | 'example_target'
  | 'example_native'
  | 'silence';

export interface AudioSegment {
  type: SegmentType;
  text: string;
  language: string;
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
}

export interface ReviewSchedulingState {
  cardId: string;
  stage: LearningStage;
  intervalMinutes?: number;
  dueAt?: string;
  masterySource?: 'earned' | 'manual';
  manualMasterySnapshot?: {
    previousStage: LearningStage;
    previousIntervalMinutes?: number;
    previousDueAt?: string;
  };
  relearning?: {
    previousStage: 'learning' | 'familiar' | 'strong' | 'mastered';
    previousIntervalMinutes: number;
    step: 'immediate' | 'one_day' | 'final';
  };
  problemStatus: 'normal' | 'leech';
  totalReviewCount: number;
  totalAgainCount: number;
  recentRatings: ReviewRating[];
  successfulReviewsSinceLastAgain: number;
}

export function createNewReviewSchedulingState(cardId: string): ReviewSchedulingState {
  return {
    cardId,
    stage: 'new',
    problemStatus: 'normal',
    totalReviewCount: 0,
    totalAgainCount: 0,
    recentRatings: [],
    successfulReviewsSinceLastAgain: 0,
  };
}

export const CardAdministrationType = {
  MANUALLY_MASTER: 'CardManuallyMastered',
  UNDO_MANUAL_MASTERY: 'ManualMasteryUndone',
  SCHEDULE_LEECH_REST: 'LeechRestScheduled',
  RESET_PROGRESS: 'CardProgressReset',
} as const;

export type CardAdministrationType = typeof CardAdministrationType[keyof typeof CardAdministrationType];

export interface CardAdministrationCommand {
  commandId: string;
  type: CardAdministrationType;
  confirmHistoryRetention?: true;
}

export interface CardAdministrationEvent {
  eventId: string;
  commandId: string;
  type: CardAdministrationType;
  cardId: string;
  occurredAt: string;
  historyRetained: true;
}

export interface CardAdministrationResult {
  event: CardAdministrationEvent;
  nextState: ReviewSchedulingState;
}

const ADMIN_REST_DAYS = 7;
const ADMIN_UNDO_MAXIMUM_MINUTES = 7 * 1_440;

export function applyCardAdministration(
  state: ReviewSchedulingState,
  command: CardAdministrationCommand,
  occurredAt: Date,
  eventId: string,
): CardAdministrationResult {
  if (command.type === CardAdministrationType.RESET_PROGRESS && command.confirmHistoryRetention !== true) {
    throw new Error('Progress reset requires confirmation that review history will be retained');
  }
  return {
    event: {
      eventId,
      commandId: command.commandId,
      type: command.type,
      cardId: state.cardId,
      occurredAt: occurredAt.toISOString(),
      historyRetained: true,
    },
    nextState: nextAdministrationState(state, command.type, occurredAt),
  };
}

function nextAdministrationState(
  state: ReviewSchedulingState,
  type: CardAdministrationType,
  occurredAt: Date,
): ReviewSchedulingState {
  if (type === CardAdministrationType.MANUALLY_MASTER) {
    if (state.masterySource === 'manual') return state;
    return {
      ...state,
      stage: 'mastered', intervalMinutes: undefined, dueAt: undefined, relearning: undefined,
      masterySource: 'manual',
      manualMasterySnapshot: {
        previousStage: state.stage,
        previousIntervalMinutes: state.intervalMinutes,
        previousDueAt: state.dueAt,
      },
    };
  }
  if (type === CardAdministrationType.UNDO_MANUAL_MASTERY) {
    const snapshot = state.manualMasterySnapshot;
    if (state.masterySource !== 'manual' || !snapshot) throw new Error('Card is not manually mastered');
    if (snapshot.previousStage === 'new' || snapshot.previousIntervalMinutes === undefined) {
      return {
        ...state, stage: 'new', intervalMinutes: undefined, dueAt: undefined,
        masterySource: undefined, manualMasterySnapshot: undefined,
      };
    }
    const intervalMinutes = Math.min(snapshot.previousIntervalMinutes, ADMIN_UNDO_MAXIMUM_MINUTES);
    return {
      ...state,
      stage: stageForAdministrativeInterval(intervalMinutes),
      intervalMinutes,
      dueAt: new Date(occurredAt.getTime() + intervalMinutes * 60_000).toISOString(),
      masterySource: undefined,
      manualMasterySnapshot: undefined,
    };
  }
  if (type === CardAdministrationType.SCHEDULE_LEECH_REST) {
    if (state.problemStatus !== 'leech') throw new Error('Only leech cards can be rested');
    return {
      ...state,
      dueAt: new Date(occurredAt.getTime() + ADMIN_REST_DAYS * 86_400_000).toISOString(),
    };
  }
  return createNewReviewSchedulingState(state.cardId);
}

function stageForAdministrativeInterval(intervalMinutes: number): LearningStage {
  if (intervalMinutes >= 60 * 1_440) return 'mastered';
  if (intervalMinutes >= 14 * 1_440) return 'strong';
  if (intervalMinutes >= 3 * 1_440) return 'familiar';
  return 'learning';
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
}

export interface ScheduledCard extends Card {
  reviewState: ReviewSchedulingState;
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
  coverSeed?: string | null;
  coverImageUrl?: string | null;
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

// ─── MULTILINGUAL V2 READ MODELS ─────────────────────────────────────────────

export interface LearningContextView {
  id: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  isActive: boolean;
}

export interface CardView {
  id: string;
  learningContextId: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  lexeme: {
    id: string;
    text: string;
    partOfSpeech: string;
    grammar: Record<string, unknown>;
    phonetic: string | null;
  };
  localization: {
    language: LanguageCode;
    translation: string;
    definition: string | null;
  };
  examples: Array<{
    id: string;
    targetText: string;
    sourceText: string | null;
  }>;
  personalNote: string;
  reviewState: ReviewSchedulingState;
  collectionIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface CollectionSummaryView {
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
  createdAt: string;
  updatedAt: string;
}

export interface VaultView {
  learningContext: LearningContextView;
  allWords: {
    itemCount: number;
    dueCount: number;
    masteredPercentage: number;
  };
  collections: CollectionSummaryView[];
  platformCollections: {
    availableCount: number;
  };
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

/** Server-side / API shape for a completed review session. */
export interface ReviewSession {
  id: string;
  userId: string;
  deckId: string;
  startedAt: string;
  completedAt: string | null;
  totalCards: number;
  reviewedCards: number;
  newCards: number;
  ratings: Record<string, ReviewRating>;
}

// ─── SYNC ─────────────────────────────────────────────────────────────────────
// The offline sync queue (SyncOperation / SyncOperationType) is mobile-only
// infrastructure and lives in apps/mobile core/services/sync.service.ts — it
// carries mobile-specific fields (e.g. nextRetryAt) and its operation-type union
// is owned there. Do NOT add a parallel SyncOperation here; it caused type drift.

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
  exampleNative: string;       // Native-language translation of example
  description: string;         // Multi-paragraph plain text explanation
  conjugationTable?: Array<{ pronoun: string; form: string }>;
  additionalExamples: Array<{ de: string; native: string }>;
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
  translation: string;         // native-language translation (e.g. "starry sky")
  article: 'der' | 'die' | 'das' | null;
  wordType: 'noun' | 'verb' | 'adjective' | 'adverb' | 'other';
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  conjugations?: VerbConjugations;
}

export interface PlatformStoryKeyword extends StoryKeyword {
  wordId: string;
}

export interface StorySentence {
  index: number;
  german: string;
  native: string;
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

/**
 * Canonical word-count range per story length band — the single source of truth
 * shared by story generation (prompt word targets) and length inference for
 * legacy rows that predate the stored `lengthType`. Keep bands ordered shortest
 * → longest; {@link storyLengthFromWordCount} relies on that order.
 */
export const STORY_LENGTH_WORD_RANGES: Record<StoryLength, { min: number; max: number }> = {
  'short':      { min: 80,   max: 150 },
  'medium':     { min: 200,  max: 320 },
  'long':       { min: 400,  max: 520 },
  'very-long':  { min: 700,  max: 900 },
  'extra-long': { min: 1100, max: 1400 },
};

const STORY_LENGTH_ORDER: StoryLength[] = ['short', 'medium', 'long', 'very-long', 'extra-long'];

/**
 * Infer the length band for a story from its word count. Used as a fallback when a
 * row has no stored `lengthType`. Bucketed by each band's upper bound so it stays
 * consistent with the word targets fed to the generation prompt.
 */
export function storyLengthFromWordCount(words: number): StoryLength {
  for (const band of STORY_LENGTH_ORDER) {
    if (words <= STORY_LENGTH_WORD_RANGES[band].max) return band;
  }
  return 'extra-long';
}

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
  bodyNative: string;
  nativeLang: LanguageCode;
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
  /**
   * Set when this story was adopted ("Added to my stories") from a platform
   * story. null/absent = user-generated. Used to dedup adoption and to filter
   * already-adopted stories out of the Explore catalogue.
   */
  sourcePlatformStoryId?: string | null;
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

// ─── DISCOUNT CODES ──────────────────────────────────────────────────────────

/** Body for redeeming a discount code (user-facing). */
export interface RedeemDiscountCodeDto {
  code: string;
}

/**
 * Result of a redeem attempt.
 * - `activated`: a 100%-off code was applied and Pro is now active.
 * - `partial`:   a <100% code is valid but there is no in-app checkout yet, so the
 *                client routes the user to the manual upgrade flow with `percentOff` pre-filled.
 * - `invalid`:   the code does not exist, is inactive/expired, exhausted, or already used by this user.
 */
export interface RedeemDiscountResult {
  status:        'activated' | 'partial' | 'invalid';
  percentOff?:   number;
  message?:      string;
  subscription?: SubscriptionStatus;
}

/** Admin: create a new discount code. `code` optional → auto-generated when omitted. */
export interface AdminGenerateDiscountCodeDto {
  code?:           string;
  percentOff:      number;          // 1–100
  durationDays:    number | null;   // null = lifetime
  maxRedemptions:  number | null;   // null = unlimited
  expiresAt:       string | null;   // ISO date, null = no expiry
  label?:          string;
}

/** Admin: toggle a discount code on/off. */
export interface AdminSetDiscountCodeActiveDto {
  isActive: boolean;
}

/** Admin: discount code as shown in the management list. */
export interface AdminDiscountCodeListItem {
  id:             string;
  code:           string;
  percentOff:     number;
  durationDays:   number | null;
  maxRedemptions: number | null;
  redeemedCount:  number;
  expiresAt:      string | null;
  isActive:       boolean;
  label:          string | null;
  createdAt:      string;
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
  bodyNative: string;
  nativeLang: LanguageCode;
  sentences: StorySentence[];
  wordTimestamps: WordTimestamp[];
  keywords: PlatformStoryKeyword[];
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
  /** Story length band. Falls back to a word-count-derived value for older rows. */
  lengthType: StoryLength;
}

export type StoryAdoptionStatus = 'not-adopted' | 'adopted';

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
  /** Story length band. Falls back to a word-count-derived value for older rows. */
  lengthType: StoryLength;
  /** Whether the current user has already added this platform story to their stories. */
  adoptionStatus: StoryAdoptionStatus;
  /** ID of the user's Story entity if already adopted, null otherwise. */
  adoptedStoryId: string | null;
}

/** Result of POST /platform-stories/:id/adopt — the copied user-owned Story. */
export interface AdoptPlatformStoryResult {
  story: Story;
  /** False when the story was already adopted (idempotent no-op). */
  created: boolean;
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
  uiLanguage: LanguageCode;
  onboardingCompletedAt: string | null;
  onboardingStep: number | null;
  motivation: OnboardingMotivation | null;
  level: OnboardingLevel | null;
}

export interface OnboardingSettings {
  onboardingStep: number | null;
  motivation: OnboardingMotivation | null;
  level: OnboardingLevel | null;
  completeOnboarding: boolean;
}

export type UpdateUserSettingsDto = Partial<StudyGoals & ReminderSettings & { uiLanguage: LanguageCode } & OnboardingSettings> & {
  /**
   * ISO timestamp of when the edit was made on the originating device.
   * Used for per-field last-write-wins reconciliation so a stale offline
   * edit that arrives late cannot clobber a newer edit from another device.
   * Optional for back-compat: legacy clients that omit it fall back to
   * server receive-time.
   */
  clientUpdatedAt?: string;
};

export const DEFAULT_STUDY_GOALS: StudyGoals = {
  dailyGoal: 20,
  weeklyGoal: 120,
  monthlyGoal: 500,
};

export const DEFAULT_REMINDER_SETTINGS: Omit<ReminderSettings, 'timezone'> = {
  remindersEnabled: false,
  reminderTime: '19:00',
};

export const SUGGESTED_DAILY_GOAL: Record<OnboardingLevel, number> = {
  beginner: 10,
  some: 20,
  intermediate: 30,
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
  topic?: CollectionTopic;
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
  native: string;
  wordsUsed: string[];
}

export interface GeneratedPlatformStoryKeyword {
  germanBase: string;
  article: 'der' | 'die' | 'das' | null;
  translation: string;
  wordType: 'noun' | 'verb' | 'adjective' | 'adverb' | 'other';
  level: CefrLevel;
}

/** Quiz question as supplied in the import JSON (id is assigned server-side). */
export interface GeneratedPlatformStoryQuiz {
  sentenceTemplate: string;
  correctAnswer: string;
  distractors: string[];
  audioSentence?: string;
  hint?: string;
}

/** Grammar note as supplied in the import JSON (id is assigned server-side). */
export interface GeneratedPlatformStoryGrammar {
  title: string;
  exampleDe: string;
  exampleNative: string;
  description: string;
  conjugationTable?: Array<{ pronoun: string; form: string }>;
  additionalExamples: Array<{ de: string; native: string }>;
}

export interface GeneratedPlatformStory {
  title: string;
  titleTranslation: string;
  level: CefrLevel;
  topic: CollectionTopic;
  /** ISO code of the translation language used in `sentences[].native`. Defaults to 'en' when omitted. */
  nativeLang?: LanguageCode;
  /** Story length band. Defaults to 'short' for A1/A2 and 'medium' otherwise when omitted. */
  length?: StoryLength;
  sentences: GeneratedPlatformStorySentence[];
  keywords: GeneratedPlatformStoryKeyword[];
  /** Optional — when present, imported with the story so it aligns with user-generated stories. */
  quizQuestions?: GeneratedPlatformStoryQuiz[];
  /** Optional — when present, imported with the story so it aligns with user-generated stories. */
  grammarNotes?: GeneratedPlatformStoryGrammar[];
}

export interface AdminImportStoryDto {
  platformCollectionId: string;
  story: GeneratedPlatformStory;
  isFiction?: boolean;
  /** When true, generate narration audio + word timestamps via TTS at import time. */
  generateAudio?: boolean;
}

export interface AdminImportStoryResult {
  storyId: string;
  title: string;
  sentenceCount: number;
  keywordsResolved: number;
  /** True when narration audio was successfully generated and attached. */
  audioGenerated: boolean;
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
  topic?: CollectionTopic;
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

export interface AdminPlatformCollectionImportPayload {
  schemaVersion: 2;
  fileName?: string;
  collection: {
    externalId: string;
    title: string;
    description: string;
    sourceLanguage: string;
    targetLanguage: string;
    level: CefrLevel;
    topic: CollectionTopic;
    cover: { mode: 'derived' };
  };
  items: Array<{
    position: number;
    lexeme: {
      text: string;
      partOfSpeech: 'noun' | 'verb' | 'adjective' | 'adverb' | 'other';
      grammar: { article: string | null; gender: string | null; plurals: string[] };
      phonetic: string | null;
      cefrLevel: CefrLevel | null;
    };
    localization: { language: string; translation: string; definition: string | null };
    examples: Array<{ targetText: string; sourceText: string }>;
  }>;
}

export interface AdminPlatformCollectionImportConflict {
  code: 'duplicate-position' | 'duplicate-lexeme' | 'translation-mismatch' | 'existing-content-conflict' | 'invalid-grammar' | 'external-id-conflict';
  itemIndex: number;
  pointer: string;
  severity: 'error';
  message: string;
  remediation: string;
}

export interface AdminPlatformCollectionImportPreview {
  fingerprint: string;
  status: 'valid' | 'conflicts';
  fileName: string;
  schemaVersion: 2;
  sourceLanguage: string;
  targetLanguage: string;
  counts: {
    items: number;
    reused: number;
    new: number;
    conflicts: number;
  };
  readiness: {
    metadataReady: boolean;
    lexemesResolved: number;
    localizationsReady: number;
    targetAudioReady: number;
    targetAudioRequired: number;
  };
  conflicts: AdminPlatformCollectionImportConflict[];
  collection: {
    title: string;
    level: CefrLevel;
    topic: CollectionTopic;
    coverSeed: string;
    status: 'draft';
  };
}

export interface AdminCreatePlatformCollectionImportDto {
  fingerprint: string;
  payload: AdminPlatformCollectionImportPayload;
}

export interface AdminPlatformCollectionImportResult {
  importId: string;
  collectionId: string | null;
  title: string;
  status: 'processing' | 'completed' | 'needs_attention';
  inserted: number;
  reused: number;
  audioLinked: number;
}

export interface AdminPlatformCollectionImportStatus {
  importId: string;
  fingerprint: string;
  status: 'processing' | 'completed' | 'needs_attention' | 'failed';
  collectionId: string | null;
  title: string;
  inserted: number;
  reused: number;
  audioLinked: number;
  error: string | null;
  stage: 'queued' | 'resolve_vocabulary' | 'prepare_audio' | 'commit_collection' | 'complete' | 'failed';
  processedItems: number;
  totalItems: number;
  rowErrors: Array<{ itemIndex: number | null; message: string }>;
}

export interface AdminPlatformCollectionListItem {
  id: string;
  title: string;
  emoji: string | null;
  coverImageUrl: string | null;
  level: string;
  topic: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  status: 'draft' | 'needs_attention' | 'ready_to_publish' | 'published' | 'failed';
  wordCount: number;
  dictionaryLinked: number;
  isPublished: boolean;
  /** Admin-set story category for deterministic story pairing (LC-414). */
  storyCategory: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPlatformCollectionWordItem {
  id: string;
  dictionaryWordId: string;
  lexemeId: string | null;
  position: number;
  targetText: string;
  translation: string;
  localizationReady: boolean;
}

export interface AdminReorderPlatformCollectionWordsDto {
  itemIds: string[];
}

export interface AdminPlatformStoryListItem {
  id: string;
  title: string;
  titleTranslation: string;
  level: string;
  category: string;
  wordCount: number;
  isPublished: boolean;
  platformCollectionId: string | null;
  publishedAt: string;
}

export interface AdminPublishToggleDto {
  isPublished: boolean;
}

export interface AdminSetStoryCategoryDto {
  /** Enum value matching StoryCategory, or null to clear the pairing. */
  storyCategory: string | null;
}

export interface AdminUpdatePlatformCollectionDto {
  title: string;
  level: CefrLevel;
}

// ─── PLATFORM COLLECTIONS — PUBLIC (LC-403a) ─────────────────────────────────

export type PlatformCollectionAdoptionStatus = 'not-adopted' | 'adopted';

export interface PlatformCollectionSummary {
  id: string;
  title: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  coverSeed: string;
  coverImageUrl: string | null;
  emoji: string | null;
  level: CefrLevel;
  topic: string;
  wordCount: number;
  /** Exact count of this set's shared lexemes already learned in the active context. */
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

// ─── SOCIAL SHARING ─────────────────────────────────────────────────────────

export type ShareResourceType = 'collection' | 'story';
export type ShareStatus = 'pending' | 'accepted' | 'rejected' | 'expired';
export type ShareSyncMode = 'copy' | 'sync';

export interface ShareRecord {
  id: string;
  senderUserId: string;
  senderName: string;
  senderEmail: string;
  recipientUserId: string;
  recipientEmail: string;
  resourceType: ShareResourceType;
  resourceId: string;
  resourceName: string;
  resourceEmoji: string | null;
  syncMode: ShareSyncMode;
  status: ShareStatus;
  clonedResourceId: string | null;
  createdAt: string;
  respondedAt: string | null;
}

export interface CreateShareDto {
  recipientEmail: string;
  resourceType: ShareResourceType;
  resourceId: string;
  syncMode: ShareSyncMode;
}

export interface RespondToShareDto {
  accept: boolean;
}

export interface ShareNotification {
  id: string;
  senderName: string;
  resourceType: ShareResourceType;
  resourceName: string;
  resourceEmoji: string | null;
  syncMode: ShareSyncMode;
  createdAt: string;
}

export interface ShareNotificationList {
  pending: ShareNotification[];
  total: number;
}

// ─── PODCASTS ───────────────────────────────────────────────────────────────

export type PodcastContentStatus = 'draft' | 'published' | 'archived';
export type PodcastEpisodeStatus =
  | 'draft'
  | 'validating'
  | 'queued'
  | 'generating'
  | 'ready_for_review'
  | 'published'
  | 'failed'
  | 'archived';

export interface PodcastThumbnail {
  assetId: string;
  cardUrl: string;
  cardWidth: number;
  cardHeight: number;
  heroUrl: string;
  heroWidth: number;
  heroHeight: number;
  accessibilityDescription: string;
  focalPoint: { x: number; y: number };
  version: number;
}

export interface AdminPodcastEpisodeListItem {
  id: string;
  topicId: string;
  externalId: string;
  title: string;
  titleTranslation: string;
  description: string;
  level: CefrLevel;
  position: number;
  audioDurationMs: number;
  audioUrl: string | null;
  audioVersion: number;
  generationError: string | null;
  generationRequestId: string | null;
  elevenLabsProjectId: string | null;
  hasTranscript: boolean;
  estimatedDurationMs: number;
  status: PodcastEpisodeStatus;
  thumbnail: PodcastThumbnail | null;
  createdAt: string;
  updatedAt: string;
}

export interface PodcastWordTiming {
  text: string;
  startMs: number;
  endMs: number;
}

export interface AdminGeneratePodcastAudioResult {
  episodeId: string;
  status: 'ready_for_review';
  audioUrl: string;
  audioDurationMs: number;
  audioVersion: number;
  turnCount: number;
}

export type PodcastVocabularyMastery = LearningStage;
export type PodcastReadinessRecommendation = 'ready' | 'review_first' | 'learn_first';

export interface PodcastLibraryEpisode {
  id: string;
  title: string;
  titleTranslation: string;
  level: CefrLevel;
  position: number;
  durationMs: number;
  focusVocabularyCount: number;
  thumbnail: PodcastThumbnail;
}

export interface PodcastLibraryTopic {
  id: string;
  title: string;
  description: string;
  targetLanguage: LanguageCode;
  translationLanguage: LanguageCode;
  minimumLevel: CefrLevel;
  maximumLevel: CefrLevel;
  episodeCount: number;
  totalDurationMs: number;
  thumbnail: PodcastThumbnail;
}

export type PodcastListeningStatus = 'in_progress' | 'completed';

export interface PodcastEpisodeActivity {
  episode: PodcastLibraryEpisode & {
    topicId: string;
    topicTitle: string;
  };
  positionMs: number;
  progressPercent: number;
  status: PodcastListeningStatus;
  completedAt: string | null;
  updatedAt: string;
}

export interface PodcastLibraryResponse {
  topics: PodcastLibraryTopic[];
  continueListening: PodcastEpisodeActivity | null;
  recentEpisodes: PodcastEpisodeActivity[];
}

export interface PodcastTopicDetail extends PodcastLibraryTopic {
  episodes: PodcastLibraryEpisode[];
}

export interface PodcastPreparationVocabulary {
  lexemeId: string;
  text: string;
  translation: string;
  importance: PodcastVocabularyImportance;
  mastery: PodcastVocabularyMastery;
  masteryWeight: number;
  isInVault: boolean;
}

export interface PodcastEpisodePreparation {
  episode: PodcastLibraryEpisode & {
    topicId: string;
    topicTitle: string;
    description: string;
    audioUrl: string;
  };
  readiness: {
    percent: number;
    recommendation: PodcastReadinessRecommendation;
    learnFirstCount: number;
  };
  vocabulary: PodcastPreparationVocabulary[];
  preparationCollectionId: string | null;
}

export interface PodcastEpisodeCompletion {
  episode: PodcastLibraryEpisode & {
    topicId: string;
    topicTitle: string;
  };
  completedAt: string;
  vocabulary: PodcastPreparationVocabulary[];
  nextEpisode: PodcastLibraryEpisode | null;
}

export interface PodcastPlayerSpeaker {
  id: string;
  key: string;
  name: string;
}

export interface PodcastPlayerTurn {
  id: string;
  speakerId: string;
  position: number;
  targetText: string;
  translation: string;
  startMs: number;
  endMs: number;
  wordTimings: PodcastWordTiming[];
}

export interface PodcastEpisodePlayer {
  id: string;
  topicId: string;
  topicTitle: string;
  title: string;
  audioUrl: string;
  audioDurationMs: number;
  audioVersion: number;
  thumbnail: PodcastThumbnail;
  speakers: PodcastPlayerSpeaker[];
  turns: PodcastPlayerTurn[];
  progress: PodcastListeningProgress | null;
  playbackContext: PodcastPlaybackContext;
}

export interface PodcastPlaybackContext {
  firstEpisodeId: string;
  previousEpisodeId: string | null;
  nextEpisodeId: string | null;
  nextTopic: {
    id: string;
    title: string;
    firstEpisodeId: string;
  } | null;
}

export interface PodcastListeningProgress {
  episodeId: string;
  audioVersion: number;
  positionMs: number;
  completedAt: string | null;
  updatedAt: string;
  pointsAwarded: number;
}

export interface PodcastPlaybackRange {
  startMs: number;
  endMs: number;
}

export function mergePodcastPlaybackRanges(
  existing: readonly PodcastPlaybackRange[],
  incoming: readonly PodcastPlaybackRange[],
  durationMs: number,
): PodcastPlaybackRange[] {
  const ranges = [...existing, ...incoming].map(range => ({
    startMs: Math.max(0, Math.min(durationMs, range.startMs)),
    endMs: Math.max(0, Math.min(durationMs, range.endMs)),
  })).filter(range => Number.isInteger(range.startMs)
    && Number.isInteger(range.endMs)
    && range.endMs > range.startMs)
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
  const merged: PodcastPlaybackRange[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (!previous || range.startMs > previous.endMs) {
      merged.push(range);
    } else {
      previous.endMs = Math.max(previous.endMs, range.endMs);
    }
  }
  return merged;
}

export function podcastPlaybackRangeDuration(ranges: readonly PodcastPlaybackRange[]): number {
  return ranges.reduce((total, range) => total + range.endMs - range.startMs, 0);
}

export interface SavePodcastProgressDto {
  audioVersion: number;
  positionMs: number;
  completed: boolean;
  playedRanges?: readonly PodcastPlaybackRange[];
}

export interface PreparePodcastVocabularyResult {
  collectionId: string;
  addedCount: number;
  reusedCount: number;
}

export interface AdminPodcastTopicListItem {
  id: string;
  externalId: string;
  title: string;
  description: string;
  targetLanguage: LanguageCode;
  translationLanguage: LanguageCode;
  level: CefrLevel;
  status: PodcastContentStatus;
  thumbnail: PodcastThumbnail | null;
  episodes: AdminPodcastEpisodeListItem[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminCreatePodcastTopicDto {
  title: string;
  description: string;
  targetLanguage: LanguageCode;
  translationLanguage: LanguageCode;
  level: CefrLevel;
}

export interface AdminUpdatePodcastTopicDto {
  title?: string;
  description?: string;
  level?: CefrLevel;
}

export interface AdminCreatePodcastEpisodeDto {
  requestId: string;
  vocabulary: string[];
  direction?: string;
}

export interface AdminCreatePodcastEpisodeDraftDto {
  requestId: string;
}

export interface AdminGeneratePodcastTranscriptDto {
  vocabulary: string[];
}

export interface AdminGeneratePodcastTranscriptResult {
  payload: AdminPodcastTranscriptPayload;
  preview: AdminPodcastTranscriptPreview;
}

export interface AdminCreateElevenLabsPodcastDto {
  vocabulary: string[];
}

export interface AdminCreateElevenLabsPodcastResult {
  episodeId: string;
  projectId: string;
  status: 'processing';
}

export interface AdminPodcastTranscriptPromptResult {
  prompt: string;
}

export type PodcastVocabularyImportance = 'essential' | 'supporting';
export type PodcastVoiceGender = 'female' | 'male';

export interface AdminPodcastTranscriptSpeakerInput {
  key: string;
  name: string;
  voiceGender: PodcastVoiceGender;
  voiceId?: string;
}

export interface AdminPodcastTranscriptTurnInput {
  speakerKey: string;
  targetText: string;
  translation: string;
  vocabularyRefs: string[];
}

export interface AdminPodcastTranscriptVocabularyInput {
  key: string;
  text: string;
  translation: string;
  importance: PodcastVocabularyImportance;
}

export interface AdminPodcastTranscriptEpisodeInput {
  title: string;
  titleTranslation: string;
  description: string;
}

export interface AdminPodcastTranscriptPayload {
  schemaVersion: 1;
  episode?: AdminPodcastTranscriptEpisodeInput;
  speakers: AdminPodcastTranscriptSpeakerInput[];
  turns: AdminPodcastTranscriptTurnInput[];
  vocabulary: AdminPodcastTranscriptVocabularyInput[];
}

export interface AdminPodcastTranscriptConflict {
  code: 'duplicate-key' | 'unknown-reference' | 'unresolved-vocabulary'
    | 'ambiguous-vocabulary' | 'translation-mismatch' | 'duration-limit' | 'provider-limit';
  pointer: string;
  severity: 'error';
  message: string;
  remediation: string;
}

export interface AdminPodcastVocabularyResolution {
  key: string;
  text: string;
  lexemeId: string | null;
  status: 'resolved' | 'new' | 'ambiguous';
}

export interface AdminPodcastTranscriptPreview {
  episodeId: string;
  episode: AdminPodcastTranscriptEpisodeInput | null;
  fingerprint: string;
  status: 'valid' | 'conflicts';
  counts: {
    speakers: number;
    turns: number;
    vocabulary: number;
    resolvedVocabulary: number;
    newVocabulary: number;
  };
  estimatedDurationMs: number;
  conflicts: AdminPodcastTranscriptConflict[];
  vocabulary: AdminPodcastVocabularyResolution[];
}

export interface AdminCommitPodcastTranscriptDto {
  fingerprint: string;
  payload: AdminPodcastTranscriptPayload;
}

export interface AdminCommitPodcastTranscriptResult {
  episodeId: string;
  title: string;
  titleTranslation: string;
  description: string;
  fingerprint: string;
  speakerCount: number;
  turnCount: number;
  vocabularyCount: number;
  estimatedDurationMs: number;
}
