import { computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { concatMap, from, Subject, timer } from 'rxjs';
import {
  AudioSegment,
  Card,
  PlaybackScript,
  PlayerSettings,
  PlayerStatus,
  PlayMode,
} from '@lingua-card/shared/domain';
import { CardStore } from '../../vault/store/card.store';
import { WordAudioService } from '../../../shared/audio/word-audio.service';
import { ScriptCompilerService } from '../services/script-compiler.service';

const SETTINGS_KEY = 'lc-listen-settings';
const SESSION_KEY  = 'lc-listen-session';

const defaultSettings: PlayerSettings = {
  playMode: 'examples',
  speed: 1,
  shuffle: false,
  repeat: false,
};

function loadSettings(): PlayerSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

interface SessionSnapshot {
  cardIndex: number;
  queue: Card[];
  sourceLabel: string;
}

function loadSession(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export type ListenSourceKey = 'due' | 'all' | 'struggling' | `collection:${string}`;

interface ListenState {
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

const initialState: ListenState = {
  sourceLabel: "Today's due words",
  selectedSource: 'due',
  rawQueue: [],
  queue: [],
  scripts: [],
  cardIndex: 0,
  segmentIndex: 0,
  status: 'idle',
  errorMessage: null,
  settings: defaultSettings,
};

export const ListenStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),

  withComputed(({ queue, scripts, cardIndex, segmentIndex, settings, selectedSource }) => {
    const cardStore = inject(CardStore);

    return {
      // ── Playback state ──────────────────────────────────────────────────────
      currentCard: computed<Card | null>(() => queue()[cardIndex()] ?? null),
      currentScript: computed<PlaybackScript | null>(() => scripts()[cardIndex()] ?? null),
      currentSegment: computed<AudioSegment | null>(() => {
        const script = scripts()[cardIndex()];
        return script?.segments[segmentIndex()] ?? null;
      }),
      progress: computed(() => {
        const len = queue().length;
        return len ? cardIndex() / len : 0;
      }),
      isLastCard: computed(() => cardIndex() >= queue().length - 1),
      playMode: computed(() => settings().playMode),
      speed: computed(() => settings().speed),
      isShuffled: computed(() => settings().shuffle),
      isRepeat: computed(() => settings().repeat),
      estimatedMinutes: computed(() => Math.max(1, Math.ceil(queue().length * 0.25))),

      // ── Source counts — always from CardStore (single source of truth) ──────
      dueCount: computed(() => cardStore.dueCards().length),
      allCount: computed(() => cardStore.cards().length),
      strugglingCount: computed(() =>
        cardStore.cards().filter(c => (c.srsState?.masteryLevel ?? 5) <= 2).length
      ),
      collectionCounts: computed(() => {
        const all = cardStore.cards();
        const map = new Map<string, number>();
        for (const c of all) {
          if (c.collectionId) map.set(c.collectionId, (map.get(c.collectionId) ?? 0) + 1);
        }
        return map;
      }),

    };
  }),

  withMethods((store) => {
    const compiler = inject(ScriptCompilerService);
    const wordAudio = inject(WordAudioService);
    const cardStore = inject(CardStore);

    // The serial pipeline — emitted segments play one at a time.
    const segmentSubject$ = new Subject<AudioSegment>();

    function compileQueue(cards: Card[], mode: PlayMode): PlaybackScript[] {
      return cards.map(c => compiler.compile(c, mode));
    }

    function shuffleArray<T>(arr: T[]): T[] {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    }

    function emitNextSegment(): void {
      const script = store.currentScript();
      const seg = store.currentSegment();
      if (script && seg) segmentSubject$.next(seg);
    }

    function saveSession(): void {
      try {
        const snap: SessionSnapshot = {
          cardIndex: store.cardIndex(),
          queue: store.queue(),
          sourceLabel: store.sourceLabel(),
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(snap));
      } catch { /* non-fatal */ }
    }

    return {
      initRunner(): void {
        segmentSubject$.pipe(
          concatMap((segment: AudioSegment) => {
            if (segment.type === 'silence') {
              return timer(segment.durationMs ?? 600);
            }
            const lang = segment.lang === 'de' ? 'de-DE' : 'en-US';
            return from(wordAudio.playAsPromise(segment.text, lang));
          }),
          takeUntilDestroyed(),
        ).subscribe({
          next: () => {
            if (store.status() !== 'playing') return;
            const script = store.currentScript();
            const segIdx = store.segmentIndex();
            if (!script) return;

            if (segIdx < script.segments.length - 1) {
              patchState(store, { segmentIndex: segIdx + 1 });
              emitNextSegment();
            } else {
              const cardIdx = store.cardIndex();
              const queueLen = store.queue().length;
              if (cardIdx >= queueLen - 1) {
                if (store.settings().repeat) {
                  patchState(store, { cardIndex: 0, segmentIndex: 0, status: 'playing' });
                  emitNextSegment();
                } else {
                  patchState(store, { status: 'complete' });
                }
              } else {
                patchState(store, { cardIndex: cardIdx + 1, segmentIndex: 0 });
                saveSession();
                emitNextSegment();
              }
            }
          },
          error: (err) => {
            patchState(store, {
              status: 'error',
              errorMessage: err?.message ?? 'Audio failed',
            });
          },
        });
      },

      loadQueue(cards: Card[], label: string): void {
        const mode = store.settings().playMode;
        const queue = store.settings().shuffle ? shuffleArray(cards) : [...cards];
        const scripts = compileQueue(queue, mode);
        patchState(store, {
          rawQueue: [...cards],
          queue,
          scripts,
          sourceLabel: label,
          cardIndex: 0,
          segmentIndex: 0,
          status: 'idle',
          errorMessage: null,
        });
        localStorage.removeItem(SESSION_KEY);

        // Pre-warm audio
        const toWarm = queue.flatMap(c => {
          const word = c.content.article ? `${c.content.article} ${c.content.back}` : c.content.back;
          const items = [
            { text: word, language: 'de-DE' },
            { text: c.content.front, language: 'en-US' },
          ];
          const ex = c.content.examples?.[0];
          if (ex) {
            items.push({ text: ex.target, language: 'de-DE' });
            items.push({ text: ex.native, language: 'en-US' });
          }
          return items;
        });
        void wordAudio.preWarm(toWarm);
      },

      loadDueCards(): void {
        patchState(store, { selectedSource: 'due' });
        const due = cardStore.dueCards();
        const cards = due.length ? due : cardStore.cards().slice(0, 20);
        const label = due.length ? "Today's due words" : 'All words';
        this.loadQueue(cards, label);
      },

      loadAllCards(): void {
        patchState(store, { selectedSource: 'all' });
        this.loadQueue(cardStore.cards(), 'All cards');
      },

      loadStrugglingCards(): void {
        patchState(store, { selectedSource: 'struggling' });
        const cards = cardStore.cards().filter(c => (c.srsState?.masteryLevel ?? 5) <= 2);
        this.loadQueue(cards, 'Struggling words');
      },

      loadCollectionCards(colId: string, colName: string): void {
        patchState(store, { selectedSource: `collection:${colId}` });
        const cards = cardStore.cards().filter(c => c.collectionId === colId);
        this.loadQueue(cards, `Collection: ${colName}`);
      },

      start(opts: { shuffle?: boolean } = {}): void {
        if (opts.shuffle !== undefined) {
          const settings = { ...store.settings(), shuffle: opts.shuffle };
          patchState(store, { settings });
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        }
        const queue = store.settings().shuffle ? shuffleArray(store.rawQueue()) : [...store.rawQueue()];
        const scripts = compileQueue(queue, store.settings().playMode);
        patchState(store, { queue, scripts, cardIndex: 0, segmentIndex: 0, status: 'playing', errorMessage: null });
        emitNextSegment();
      },

      play(): void {
        patchState(store, { status: 'playing', errorMessage: null });
        emitNextSegment();
      },

      pause(): void {
        patchState(store, { status: 'paused' });
      },

      resume(): void {
        patchState(store, { status: 'playing', errorMessage: null });
        emitNextSegment();
      },

      next(): void {
        const idx = store.cardIndex();
        const queueLen = store.queue().length;
        if (idx >= queueLen - 1) return;
        const wasPlaying = store.status() === 'playing';
        patchState(store, { cardIndex: idx + 1, segmentIndex: 0 });
        saveSession();
        if (wasPlaying) emitNextSegment();
      },

      previous(): void {
        const idx = store.cardIndex();
        if (idx <= 0) return;
        const wasPlaying = store.status() === 'playing';
        patchState(store, { cardIndex: idx - 1, segmentIndex: 0 });
        if (wasPlaying) emitNextSegment();
      },

      retrySegment(): void {
        patchState(store, { status: 'playing', errorMessage: null });
        emitNextSegment();
      },

      skipCard(): void {
        const idx = store.cardIndex();
        const queueLen = store.queue().length;
        if (idx >= queueLen - 1) {
          patchState(store, { status: 'complete' });
          return;
        }
        patchState(store, { cardIndex: idx + 1, segmentIndex: 0, status: 'playing', errorMessage: null });
        emitNextSegment();
      },

      updateSettings(partial: Partial<PlayerSettings>): void {
        const settings = { ...store.settings(), ...partial };
        patchState(store, { settings });
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

        if ('playMode' in partial) {
          const playedIdx = store.cardIndex();
          const remaining = store.rawQueue().slice(playedIdx);
          const recompiled = compileQueue(remaining, settings.playMode);
          const newScripts = [...store.scripts().slice(0, playedIdx), ...recompiled];
          patchState(store, { scripts: newScripts });
        }
      },

      restartWithShuffle(): void {
        const queue = shuffleArray(store.rawQueue());
        const scripts = compileQueue(queue, store.settings().playMode);
        patchState(store, { queue, scripts, cardIndex: 0, segmentIndex: 0, status: 'playing', errorMessage: null });
        emitNextSegment();
      },

      resetToIdle(): void {
        patchState(store, { status: 'idle', segmentIndex: 0, errorMessage: null, selectedSource: 'due' });
        localStorage.removeItem(SESSION_KEY);
        this.loadDueCards();
      },
    };
  }),

  withHooks({
    onInit(store) {
      // Restore persisted settings
      const saved = loadSettings();
      patchState(store, { settings: saved });

      // Restore last session if available
      const session = loadSession();
      if (session?.queue?.length) {
        const mode = saved.playMode;
        const scripts = session.queue.map((c: Card) =>
          inject(ScriptCompilerService).compile(c, mode)
        );
        patchState(store, {
          rawQueue: session.queue,
          queue: session.queue,
          scripts,
          cardIndex: Math.min(session.cardIndex, session.queue.length - 1),
          segmentIndex: 0,
          sourceLabel: session.sourceLabel,
          status: 'idle',
        });
      } else {
        // Auto-load due cards on first open
        store.loadDueCards();
      }

      store.initRunner();
    },
  }),
);
