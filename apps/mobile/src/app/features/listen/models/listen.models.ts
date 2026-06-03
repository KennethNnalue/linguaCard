import { Card, PlaybackScript, PlayMode, PlayerSettings, PlayerStatus } from '@lingua-card/shared/domain';

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

// now-playing omits 0.95 — derived so both arrays stay in sync
export const PLAYBACK_SPEEDS: PlaybackSpeed[] = LISTEN_SPEEDS_EXTENDED.filter(s => s !== 0.95);

// ─── Play Modes ───────────────────────────────────────────────────────────────

export interface PlayModeOption {
  value: PlayMode;
  label: string;
  desc: string;
}

export const PLAY_MODE_OPTIONS: PlayModeOption[] = [
  { value: 'compact',  label: 'Compact',   desc: 'Word + meaning' },
  { value: 'examples', label: 'Examples',  desc: 'Full sentences' },
  { value: 'deepDive', label: 'Deep Dive', desc: '+ grammar tip'  },
];

export const PlayModeLabel: Record<PlayMode, string> = {
  compact:  'Compact mode',
  examples: 'Examples mode',
  deepDive: 'Deep Dive mode',
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

// ─── Mastery Threshold ────────────────────────────────────────────────────────

export const STRUGGLING_MASTERY_THRESHOLD = 2;

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
  queue: Card[];
  sourceLabel: string;
}

export interface ListenState {
  sourceLabel: string;
  selectedSource: ListenSourceKey;
  rawQueue: Card[];
  queue: Card[];
  scripts: PlaybackScript[];
  cardIndex: number;
  segmentIndex: number;
  status: PlayerStatus;
  errorMessage: string | null;
  settings: PlayerSettings;
}

// ─── Modal CSS Class ──────────────────────────────────────────────────────────

export const PLAYLIST_SOURCE_SHEET_CSS_CLASS = 'pss-modal';
