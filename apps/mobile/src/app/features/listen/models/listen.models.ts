import {
  ArticleType,
  PlaybackScript,
  PlayMode,
  PlayerSettings,
  PlayerStatus,
  ScheduledCard,
} from '@lingua-card/shared/domain';

// ─── Storage Keys ─────────────────────────────────────────────────────────────

export const LISTEN_SETTINGS_KEY = 'lc-listen-settings';
export const LISTEN_SESSION_KEY = 'lc-listen-session';

// ─── Source Identifiers ───────────────────────────────────────────────────────

export const ListenSource = {
  Due: 'due',
  All: 'all',
  Struggling: 'struggling',
} as const;

export type ListenSourceKey = typeof ListenSource[keyof typeof ListenSource] | `collection:${string}`;

// ─── Source Labels ────────────────────────────────────────────────────────────

export const ListenSourceLabel = {
  Due: "Today's due words",
  All: 'All words',
  AllCards: 'All cards',
  Struggling: 'Struggling words',
} as const;

// ─── Playback Speeds ──────────────────────────────────────────────────────────

export type PlaybackSpeed = 0.75 | 0.95 | 1 | 1.25 | 1.5;

export const LISTEN_SPEEDS_EXTENDED: PlaybackSpeed[] = [0.75, 0.95, 1, 1.25, 1.5];

export const PLAYBACK_SPEEDS: PlaybackSpeed[] = LISTEN_SPEEDS_EXTENDED;

// ─── Play Modes ───────────────────────────────────────────────────────────────

export interface PlayModeOption {
  value: PlayMode;
  labelKey: string;
  descKey: string;
}

export const PLAY_MODE_OPTIONS: PlayModeOption[] = [
  { value: 'words', labelKey: 'listen.playlistMode.wordsLabel', descKey: 'listen.playlistMode.wordsDesc' },
  {
    value: 'wordsWithExamples',
    labelKey: 'listen.playlistMode.wordsWithExamplesLabel',
    descKey: 'listen.playlistMode.wordsWithExamplesDesc',
  },
];

/** i18n keys for the mode badge shown on the Session Complete screen. */
export const PlayModeLabelKey: Record<PlayMode, string> = {
  words: 'listen.playlistMode.wordsModeBadge',
  wordsWithExamples: 'listen.playlistMode.wordsWithExamplesModeBadge',
};

// ─── Silence Durations (ms) ───────────────────────────────────────────────────

export const SilenceDuration = {
  AfterWord:        600,
  BeforeExample:    900,
  BetweenExample:   500,
  BeforeGrammarTip: 700,
  AfterCard:       1200,
} as const;

// ─── Queue Limits ─────────────────────────────────────────────────────────────

export const MAX_FALLBACK_QUEUE_SIZE = 20;

// ─── Audio Prefetch ───────────────────────────────────────────────────────────

// How many cards ahead (incl. the current one) to pre-warm target-language audio
// for. Replaces whole-queue pre-warm so we don't generate audio for cards the
// user never reaches. Window slides forward as playback advances.
export const LISTEN_PREFETCH_WINDOW = 5;

// ─── Estimated Duration ───────────────────────────────────────────────────────

export const MINUTES_PER_CARD = 0.25;
export const MIN_ESTIMATED_MINUTES = 1;

// ─── Default Settings ─────────────────────────────────────────────────────────

export const DEFAULT_LISTEN_SETTINGS: PlayerSettings = {
  playMode: 'wordsWithExamples',
  speed: 1,
  shuffle: false,
  repeat: false,
};

// ─── State Interfaces ─────────────────────────────────────────────────────────

export interface SessionSnapshot {
  cardIndex: number;
  queue: VocabularyPlaylistItem[];
  sourceLabel: string;
  playlistId: string;
  languages: VocabularyPlaylistLanguages;
}

export interface VocabularyPlaylistLanguages {
  target: string;
  native: string;
}

export interface VocabularyExamplePair {
  target: string;
  native: string;
}

export interface VocabularyPlaylistItem {
  id: string;
  article: ArticleType;
  target: string;
  native: string;
  example: VocabularyExamplePair | null;
  categoryIds: readonly string[];
  learningStage: string;
}

export type VocabularyPlaylistSource =
  | { kind: 'due' }
  | { kind: 'all' }
  | { kind: 'struggling' }
  | { kind: 'collection'; collectionId: string }
  | { kind: 'custom'; sourceId: string };

export interface VocabularyPlaylistRequest {
  playlistId: string;
  title: string;
  source: VocabularyPlaylistSource;
  languages: VocabularyPlaylistLanguages;
  items: readonly VocabularyPlaylistItem[];
  initialMode?: PlayMode;
}

export const DEFAULT_PLAYLIST_LANGUAGES: VocabularyPlaylistLanguages = {
  target: 'de-DE',
  native: 'en-US',
};

export function toVocabularyPlaylistItem(card: ScheduledCard): VocabularyPlaylistItem {
  const firstExample = card.content.examples?.[0];
  return {
    id: card.id,
    article: card.content.article,
    target: card.content.back,
    native: card.content.front,
    example: firstExample
      ? { target: firstExample.target, native: firstExample.native }
      : null,
    categoryIds: [...card.categoryIds],
    learningStage: card.reviewState.stage,
  };
}

export interface ListenState {
  playlistId: string;
  languages: VocabularyPlaylistLanguages;
  sourceLabel: string;
  selectedSource: ListenSourceKey;
  rawQueue: VocabularyPlaylistItem[];
  queue: VocabularyPlaylistItem[];
  scripts: PlaybackScript[];
  cardIndex: number;
  segmentIndex: number;
  status: PlayerStatus;
  errorMessage: string | null;
  settings: PlayerSettings;
  /** Epoch ms when the current playback session started — used to compute
   *  real elapsed time on the Session Complete screen. 0 when no session. */
  sessionStartedAt: number;
  /** Offline-download state for the whole current queue's target audio. */
  downloadStatus: OfflineDownloadStatus;
}

export type OfflineDownloadStatus = 'idle' | 'downloading' | 'done';

// ─── Teleprompter ─────────────────────────────────────────────────────────────

/** A single visible playback segment row in the Now Playing teleprompter. */
export interface SegmentViewModel {
  text: string;
  langLabel: string;
  cls: '' | 'played' | 'playing';
}

// ─── Modal CSS Class ──────────────────────────────────────────────────────────

export const PLAYLIST_SOURCE_SHEET_CSS_CLASS = 'pss-modal';
