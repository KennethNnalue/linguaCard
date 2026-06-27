import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import {
  AudioSegment,
  Card,
  PlaybackScript,
  PlayerSettings,
  PlayMode,
} from '@lingua-card/shared/domain';
import { CardStore } from '../../vault/store/card.store';
import { ScriptCompilerService } from '../services/script-compiler.service';
import { ListenPlaybackEngine, PlaybackHost } from '../services/listen-playback.engine';
import {
  DEFAULT_LISTEN_SETTINGS,
  ListenSource,
  LISTEN_SESSION_KEY,
  LISTEN_SETTINGS_KEY,
  ListenSourceLabel,
  ListenState,
  MAX_FALLBACK_QUEUE_SIZE,
  MIN_ESTIMATED_MINUTES,
  MINUTES_PER_CARD,
  SessionSnapshot,
  STRUGGLING_MASTERY_THRESHOLD,
} from '../models/listen.models';

function loadSettings(): PlayerSettings {
  try {
    const raw = localStorage.getItem(LISTEN_SETTINGS_KEY);
    return raw ? { ...DEFAULT_LISTEN_SETTINGS, ...JSON.parse(raw) } : DEFAULT_LISTEN_SETTINGS;
  } catch {
    return DEFAULT_LISTEN_SETTINGS;
  }
}

function loadSession(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(LISTEN_SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' || parsed === null ||
      !Array.isArray((parsed as SessionSnapshot).queue) ||
      typeof (parsed as SessionSnapshot).cardIndex !== 'number' ||
      typeof (parsed as SessionSnapshot).sourceLabel !== 'string'
    ) return null;
    return parsed as SessionSnapshot;
  } catch {
    return null;
  }
}

const initialState: ListenState = {
  sourceLabel: ListenSourceLabel.Due,
  selectedSource: ListenSource.Due,
  rawQueue: [],
  queue: [],
  scripts: [],
  cardIndex: 0,
  segmentIndex: 0,
  status: 'idle',
  errorMessage: null,
  settings: DEFAULT_LISTEN_SETTINGS,
  sessionStartedAt: 0,
  downloadStatus: 'idle',
};

export const ListenStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),

  withComputed(({ queue, scripts, cardIndex, segmentIndex, settings }) => {
    const cardStore = inject(CardStore);

    return {
      currentCard: computed<Card | null>(() => queue()[cardIndex()] ?? null),
      currentScript: computed<PlaybackScript | null>(() => scripts()[cardIndex()] ?? null),
      currentSegment: computed<AudioSegment | null>(() => {
        const script = scripts()[cardIndex()];
        return script?.segments[segmentIndex()] ?? null;
      }),
      isLastCard: computed(() => queue().length > 0 && cardIndex() >= queue().length - 1),
      progress: computed(() => {
        const len = queue().length;
        return len ? cardIndex() / len : 0;
      }),
      progressPercent: computed(() => {
        const len = queue().length;
        return len ? (cardIndex() / len) * 100 : 0;
      }),
      playMode: computed(() => settings().playMode),
      speed: computed(() => settings().speed),
      isShuffled: computed(() => settings().shuffle),
      isRepeat: computed(() => settings().repeat),
      estimatedMinutes: computed(() =>
        Math.max(MIN_ESTIMATED_MINUTES, Math.ceil(queue().length * MINUTES_PER_CARD))
      ),
      dueCount: computed(() => cardStore.dueCards().length),
      allCount: computed(() => cardStore.cards().length),
      strugglingCount: computed(() =>
        cardStore.cards().filter(c => (c.srsState?.masteryLevel ?? 5) <= STRUGGLING_MASTERY_THRESHOLD).length
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
    const cardStore = inject(CardStore);
    const engine = inject(ListenPlaybackEngine);

    function saveSession(): void {
      try {
        const snap: SessionSnapshot = {
          cardIndex: store.cardIndex(),
          queue: store.queue(),
          sourceLabel: store.sourceLabel(),
        };
        localStorage.setItem(LISTEN_SESSION_KEY, JSON.stringify(snap));
      } catch { /* non-fatal */ }
    }

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

    // Adapter the engine reads from / writes to. Built once; the engine never
    // imports the store, so there is no circular dependency.
    const host: PlaybackHost = {
      currentScript: store.currentScript,
      currentSegment: store.currentSegment,
      status: store.status,
      settings: store.settings,
      queue: store.queue,
      cardIndex: store.cardIndex,
      segmentIndex: store.segmentIndex,
      downloadStatus: store.downloadStatus,
      patch: state => patchState(store, state),
      saveSession,
    };

    return {
      initRunner(): void {
        engine.attach(host);
      },

      stopAudio(): void {
        engine.stopAudio();
      },

      loadQueue(cards: Card[], label: string): void {
        engine.abortPlayback();
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
          downloadStatus: 'idle',
        });
        localStorage.removeItem(LISTEN_SESSION_KEY);

        // Warm only the first window of target-language audio; the window slides
        // forward as playback advances.
        engine.resetPrefetch();
        engine.prefetchWindow(0);
      },

      loadDueCards(): void {
        const due = cardStore.dueCards();
        if (due.length) {
          patchState(store, { selectedSource: ListenSource.Due });
          this.loadQueue(due, ListenSourceLabel.Due);
        } else {
          patchState(store, { selectedSource: ListenSource.All });
          this.loadQueue(cardStore.cards().slice(0, MAX_FALLBACK_QUEUE_SIZE), ListenSourceLabel.AllCards);
        }
      },

      loadAllCards(): void {
        patchState(store, { selectedSource: ListenSource.All });
        this.loadQueue(cardStore.cards(), ListenSourceLabel.AllCards);
      },

      loadStrugglingCards(): void {
        patchState(store, { selectedSource: ListenSource.Struggling });
        const cards = cardStore.cards().filter(c =>
          (c.srsState?.masteryLevel ?? 5) <= STRUGGLING_MASTERY_THRESHOLD
        );
        this.loadQueue(cards, ListenSourceLabel.Struggling);
      },

      loadCollectionCards(colId: string, sourceLabel: string): void {
        patchState(store, { selectedSource: `collection:${colId}` });
        const cards = cardStore.cards().filter(c => c.collectionId === colId);
        this.loadQueue(cards, sourceLabel);
      },

      /** Replace the display label for the current source (e.g. to localize a restored session). */
      setSourceLabel(sourceLabel: string): void {
        patchState(store, { sourceLabel });
      },

      /** Download the whole queue's target audio to the device for offline playback. */
      downloadQueueForOffline(): Promise<void> {
        return engine.downloadQueueForOffline();
      },

      start(opts: { shuffle?: boolean } = {}): void {
        if (opts.shuffle !== undefined) {
          const settings = { ...store.settings(), shuffle: opts.shuffle };
          patchState(store, { settings });
          localStorage.setItem(LISTEN_SETTINGS_KEY, JSON.stringify(settings));
        }
        const queue = store.settings().shuffle ? shuffleArray(store.rawQueue()) : [...store.rawQueue()];
        const scripts = compileQueue(queue, store.settings().playMode);
        patchState(store, {
          queue, scripts, cardIndex: 0, segmentIndex: 0, status: 'playing',
          errorMessage: null, sessionStartedAt: Date.now(),
        });
        engine.resetPrefetch();
        engine.prefetchWindow(0);
        engine.restart();
      },

      pause(): void {
        engine.pause();
      },

      resume(): void {
        engine.resume();
      },

      next(): void {
        engine.next();
      },

      previous(): void {
        engine.previous();
      },

      retrySegment(): void {
        engine.retrySegment();
      },

      skipCard(): void {
        engine.skipCard();
      },

      updateSettings(partial: Partial<PlayerSettings>): void {
        const settings = { ...store.settings(), ...partial };
        patchState(store, { settings });
        localStorage.setItem(LISTEN_SETTINGS_KEY, JSON.stringify(settings));

        if ('playMode' in partial) {
          const playedIdx = store.cardIndex();
          // Recompile from the LIVE queue (which may be shuffled) — not rawQueue —
          // so upcoming scripts stay aligned with their cards.
          const remaining = store.queue().slice(playedIdx + 1);
          const recompiled = compileQueue(remaining, settings.playMode);
          const newScripts = [...store.scripts().slice(0, playedIdx + 1), ...recompiled];
          patchState(store, { scripts: newScripts });

          // The set of audio items per card depends on the mode (examples/deepDive add
          // the example clip). Re-warm the current window and reset the offline badge.
          engine.resetPrefetch();
          engine.prefetchWindow(store.cardIndex());
          if (store.downloadStatus() === 'done') {
            patchState(store, { downloadStatus: 'idle' });
          }
        }

        // Toggling shuffle mid-session reorders the UPCOMING cards (played cards,
        // incl. the current one, stay put so the now-playing word doesn't jump).
        // Turning shuffle off restores the original rawQueue order for the rest.
        if ('shuffle' in partial && store.status() !== 'idle') {
          const playedIdx = store.cardIndex();
          const played = store.queue().slice(0, playedIdx + 1);
          const rest = store.queue().slice(playedIdx + 1);
          const restIds = new Set(rest.map(c => c.id));
          const reordered = settings.shuffle
            ? shuffleArray(rest)
            : store.rawQueue().filter(c => restIds.has(c.id));
          const newQueue = [...played, ...reordered];
          patchState(store, {
            queue: newQueue,
            scripts: compileQueue(newQueue, settings.playMode),
          });
          engine.resetPrefetch();
          engine.prefetchWindow(playedIdx);
        }
      },

      restartWithShuffle(): void {
        const settings = { ...store.settings(), shuffle: true };
        patchState(store, { settings });
        localStorage.setItem(LISTEN_SETTINGS_KEY, JSON.stringify(settings));

        const queue = shuffleArray(store.rawQueue());
        const scripts = compileQueue(queue, settings.playMode);
        patchState(store, {
          queue, scripts, cardIndex: 0, segmentIndex: 0, status: 'playing',
          errorMessage: null, sessionStartedAt: Date.now(),
        });
        engine.resetPrefetch();
        engine.prefetchWindow(0);
        engine.restart();
      },

      resetToIdle(): void {
        engine.abortPlayback();
        patchState(store, { status: 'idle', segmentIndex: 0, errorMessage: null, selectedSource: ListenSource.Due });
        localStorage.removeItem(LISTEN_SESSION_KEY);
        this.loadDueCards();
      },
    };
  }),

  withHooks({
    onInit(store) {
      const saved = loadSettings();
      patchState(store, { settings: saved });

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
        store.loadDueCards();
      }

      store.initRunner();
    },
  }),
);
