import { PlaybackScript, PlayMode, PlayerSettings, PlayerStatus, ScheduledCard } from '@lingua-card/shared/domain';

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
  { value: 'compact',  labelKey: 'listen.playlistMode.compactLabel',  descKey: 'listen.playlistMode.compactDesc' },
  { value: 'examples', labelKey: 'listen.playlistMode.examplesLabel', descKey: 'listen.playlistMode.examplesDesc' },
  { value: 'deepDive', labelKey: 'listen.playlistMode.deepDiveLabel', descKey: 'listen.playlistMode.deepDiveDesc' },
];

/** i18n keys for the mode badge shown on the Session Complete screen. */
export const PlayModeLabelKey: Record<PlayMode, string> = {
  compact:  'listen.playlistMode.compactModeBadge',
  examples: 'listen.playlistMode.examplesModeBadge',
  deepDive: 'listen.playlistMode.deepDiveModeBadge',
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
  playMode: 'examples',
  speed: 1,
  shuffle: false,
  repeat: false,
};

// ─── State Interfaces ─────────────────────────────────────────────────────────

export interface SessionSnapshot {
  cardIndex: number;
  queue: ScheduledCard[];
  sourceLabel: string;
}

export interface ListenState {
  sourceLabel: string;
  selectedSource: ListenSourceKey;
  rawQueue: ScheduledCard[];
  queue: ScheduledCard[];
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
