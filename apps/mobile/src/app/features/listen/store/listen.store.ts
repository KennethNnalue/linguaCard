import { computed, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { AudioSegment, PlaybackScript, PlayerSettings, PlayMode } from '@lingua-card/shared/domain';
import { isStruggling } from '../../review/domain/review-status';
import { CardStore } from '../../vault/store/card.store';
import {
  DEFAULT_LISTEN_SETTINGS,
  DEFAULT_PLAYLIST_LANGUAGES,
  ListenSource,
  LISTEN_SESSION_KEY,
  LISTEN_SETTINGS_KEY,
  ListenSourceLabel,
  ListenState,
  MAX_FALLBACK_QUEUE_SIZE,
  MIN_ESTIMATED_MINUTES,
  SessionSnapshot,
  toVocabularyPlaylistItem,
  VocabularyPlaylistItem,
  VocabularyPlaylistRequest,
} from '../models/listen.models';
import { ListenPlaybackEngine, PlaybackHost } from '../services/listen-playback.engine';
import { ScriptCompilerService } from '../services/script-compiler.service';
import { filter, firstValueFrom, take } from 'rxjs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function migratePlayMode(value: unknown): PlayMode {
  if (value === 'words' || value === 'compact') return 'words';
  if (value === 'wordsWithExamples' || value === 'examples' || value === 'deepDive') {
    return 'wordsWithExamples';
  }
  return DEFAULT_LISTEN_SETTINGS.playMode;
}

function loadSettings(): PlayerSettings {
  try {
    const raw = localStorage.getItem(LISTEN_SETTINGS_KEY);
    if (!raw) return DEFAULT_LISTEN_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return DEFAULT_LISTEN_SETTINGS;
    const speed = parsed['speed'];
    const validSpeed = speed === 0.75 || speed === 0.95 || speed === 1 || speed === 1.25 || speed === 1.5;
    return {
      playMode: migratePlayMode(parsed['playMode']),
      speed: validSpeed ? speed : DEFAULT_LISTEN_SETTINGS.speed,
      shuffle: typeof parsed['shuffle'] === 'boolean' ? parsed['shuffle'] : false,
      repeat: typeof parsed['repeat'] === 'boolean' ? parsed['repeat'] : false,
    };
  } catch {
    return DEFAULT_LISTEN_SETTINGS;
  }
}

function isPlaylistItem(value: unknown): value is VocabularyPlaylistItem {
  if (!isRecord(value)) return false;
  return typeof value['id'] === 'string'
    && typeof value['target'] === 'string'
    && typeof value['native'] === 'string'
    && Array.isArray(value['categoryIds'])
    && typeof value['learningStage'] === 'string';
}

function loadSession(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(LISTEN_SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const queue = parsed['queue'];
    const languages = parsed['languages'];
    if (!Array.isArray(queue) || !queue.every(isPlaylistItem)) return null;
    if (!isRecord(languages)) return null;
    if (typeof languages['target'] !== 'string' || typeof languages['native'] !== 'string') return null;
    if (typeof parsed['cardIndex'] !== 'number') return null;
    if (typeof parsed['sourceLabel'] !== 'string' || typeof parsed['playlistId'] !== 'string') return null;
    return {
      cardIndex: parsed['cardIndex'],
      queue,
      sourceLabel: parsed['sourceLabel'],
      playlistId: parsed['playlistId'],
      languages: { target: languages['target'], native: languages['native'] },
    };
  } catch {
    return null;
  }
}

function shuffleItems<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function estimateScriptSeconds(script: PlaybackScript, speed: number): number {
  const milliseconds = script.segments.reduce((total, segment) => {
    if (segment.type === 'silence') return total + (segment.durationMs ?? 0);
    return total + Math.max(900, 450 + segment.text.length * 55);
  }, 0);
  return milliseconds / 1000 / speed;
}

const initialState: ListenState = {
  playlistId: 'due',
  languages: DEFAULT_PLAYLIST_LANGUAGES,
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
      currentCard: computed<VocabularyPlaylistItem | null>(() => queue()[cardIndex()] ?? null),
      currentScript: computed<PlaybackScript | null>(() => scripts()[cardIndex()] ?? null),
      currentSegment: computed<AudioSegment | null>(() => {
        const script = scripts()[cardIndex()];
        return script?.segments[segmentIndex()] ?? null;
      }),
      isLastCard: computed(() => queue().length > 0 && cardIndex() >= queue().length - 1),
      progressPercent: computed(() => {
        const scriptList = scripts();
        const playableCounts = scriptList.map(script =>
          script.segments.filter(segment => segment.type !== 'silence').length
        );
        const total = playableCounts.reduce((sum, count) => sum + count, 0);
        if (!total) return 0;
        const completedCards = playableCounts.slice(0, cardIndex()).reduce((sum, count) => sum + count, 0);
        const currentScript = scriptList[cardIndex()];
        const completedCurrent = currentScript
          ? currentScript.segments.slice(0, segmentIndex()).filter(segment => segment.type !== 'silence').length
          : 0;
        return ((completedCards + completedCurrent) / total) * 100;
      }),
      playMode: computed(() => settings().playMode),
      speed: computed(() => settings().speed),
      isShuffled: computed(() => settings().shuffle),
      isRepeat: computed(() => settings().repeat),
      estimatedMinutes: computed(() => {
        const seconds = scripts().reduce(
          (total, script) => total + estimateScriptSeconds(script, settings().speed),
          0,
        );
        return Math.max(MIN_ESTIMATED_MINUTES, Math.ceil(seconds / 60));
      }),
      dueCount: computed(() => cardStore.dueCards().length),
      allCount: computed(() => cardStore.cards().length),
      strugglingCount: computed(() => cardStore.cards().filter(isStruggling).length),
      collectionCounts: computed(() => {
        const counts = new Map<string, number>();
        for (const card of cardStore.cards()) {
          if (card.collectionId) counts.set(card.collectionId, (counts.get(card.collectionId) ?? 0) + 1);
        }
        return counts;
      }),
    };
  }),
  withMethods((store) => {
    const compiler = inject(ScriptCompilerService);
    const cardStore = inject(CardStore);
    const engine = inject(ListenPlaybackEngine);
    const cardLoadState = toObservable(cardStore.loadState);

    function compileQueue(items: readonly VocabularyPlaylistItem[], mode: PlayMode): PlaybackScript[] {
      return items.map(item => compiler.compile(item, mode, store.languages()));
    }

    function saveSession(): void {
      const snapshot: SessionSnapshot = {
        cardIndex: store.cardIndex(),
        queue: store.queue(),
        sourceLabel: store.sourceLabel(),
        playlistId: store.playlistId(),
        languages: store.languages(),
      };
      try {
        localStorage.setItem(LISTEN_SESSION_KEY, JSON.stringify(snapshot));
      } catch {
        return;
      }
    }

    const host: PlaybackHost = {
      currentScript: store.currentScript,
      scriptAt: index => store.scripts()[index] ?? null,
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

    function setPlaylist(request: VocabularyPlaylistRequest): void {
      engine.abortPlayback();
      const settings = request.initialMode
        ? { ...store.settings(), playMode: request.initialMode }
        : store.settings();
      const rawQueue = [...request.items];
      const queue = settings.shuffle ? shuffleItems(rawQueue) : [...rawQueue];
      patchState(store, {
        playlistId: request.playlistId,
        languages: request.languages,
        sourceLabel: request.title,
        rawQueue,
        queue,
        scripts: queue.map(item => compiler.compile(item, settings.playMode, request.languages)),
        settings,
        cardIndex: 0,
        segmentIndex: 0,
        status: 'idle',
        errorMessage: null,
        downloadStatus: 'idle',
      });
      localStorage.removeItem(LISTEN_SESSION_KEY);
      engine.resetPrefetch();
      engine.prefetchWindow(0);
    }

    return {
      initRunner(): void {
        engine.attach(host);
      },
      stopAudio(): void {
        engine.stopAudio();
      },
      openPlaylist(request: VocabularyPlaylistRequest): void {
        setPlaylist(request);
      },
      loadDueCards(): void {
        const dueCards = cardStore.dueCards();
        const cards = dueCards.length ? dueCards : cardStore.cards().slice(0, MAX_FALLBACK_QUEUE_SIZE);
        const dueAvailable = dueCards.length > 0;
        patchState(store, { selectedSource: dueAvailable ? ListenSource.Due : ListenSource.All });
        setPlaylist({
          playlistId: dueAvailable ? 'due' : 'all-fallback',
          title: dueAvailable ? ListenSourceLabel.Due : ListenSourceLabel.AllCards,
          source: dueAvailable ? { kind: 'due' } : { kind: 'all' },
          languages: DEFAULT_PLAYLIST_LANGUAGES,
          items: cards.map(toVocabularyPlaylistItem),
        });
      },
      async ensureDefaultQueue(): Promise<void> {
        if (store.queue().length > 0 || store.selectedSource() !== ListenSource.Due) return;
        const state = cardStore.loadState();
        if (state.status === 'idle' || state.status === 'error') {
          await cardStore.loadCards();
        } else if (state.status === 'loading') {
          await firstValueFrom(cardLoadState.pipe(
            filter(candidate => candidate.status !== 'loading'),
            take(1),
          ));
        }
        if (store.queue().length === 0 && store.selectedSource() === ListenSource.Due) {
          this.loadDueCards();
        }
      },
      loadAllCards(): void {
        patchState(store, { selectedSource: ListenSource.All });
        setPlaylist({
          playlistId: 'all',
          title: ListenSourceLabel.AllCards,
          source: { kind: 'all' },
          languages: DEFAULT_PLAYLIST_LANGUAGES,
          items: cardStore.cards().map(toVocabularyPlaylistItem),
        });
      },
      loadStrugglingCards(): void {
        patchState(store, { selectedSource: ListenSource.Struggling });
        setPlaylist({
          playlistId: 'struggling',
          title: ListenSourceLabel.Struggling,
          source: { kind: 'struggling' },
          languages: DEFAULT_PLAYLIST_LANGUAGES,
          items: cardStore.cards().filter(isStruggling).map(toVocabularyPlaylistItem),
        });
      },
      loadCollectionCards(collectionId: string, sourceLabel: string): void {
        patchState(store, { selectedSource: `collection:${collectionId}` });
        setPlaylist({
          playlistId: `collection:${collectionId}`,
          title: sourceLabel,
          source: { kind: 'collection', collectionId },
          languages: DEFAULT_PLAYLIST_LANGUAGES,
          items: cardStore.cards()
            .filter(card => card.collectionId === collectionId)
            .map(toVocabularyPlaylistItem),
        });
      },
      setSourceLabel(sourceLabel: string): void {
        patchState(store, { sourceLabel });
      },
      downloadQueueForOffline(): Promise<void> {
        return engine.downloadQueueForOffline();
      },
      start(options: { shuffle?: boolean } = {}): void {
        if (options.shuffle !== undefined) {
          const settings = { ...store.settings(), shuffle: options.shuffle };
          patchState(store, { settings });
          localStorage.setItem(LISTEN_SETTINGS_KEY, JSON.stringify(settings));
        }
        const queue = store.settings().shuffle ? shuffleItems(store.rawQueue()) : [...store.rawQueue()];
        patchState(store, {
          queue,
          scripts: compileQueue(queue, store.settings().playMode),
          cardIndex: 0,
          segmentIndex: 0,
          status: 'loading',
          errorMessage: null,
          sessionStartedAt: Date.now(),
        });
        engine.resetPrefetch();
        void engine.prepareWindow(0).finally(() => {
          if (store.status() !== 'loading') return;
          patchState(store, { status: 'playing' });
          engine.restart();
        });
      },
      pause(): void { engine.pause(); },
      resume(): void { engine.resume(); },
      next(): void { engine.next(); },
      previous(): void { engine.previous(); },
      retrySegment(): void { engine.retrySegment(); },
      skipCard(): void { engine.skipCard(); },
      updateSettings(partial: Partial<PlayerSettings>): void {
        const settings = { ...store.settings(), ...partial };
        patchState(store, { settings });
        localStorage.setItem(LISTEN_SETTINGS_KEY, JSON.stringify(settings));
        if (partial.playMode) {
          const currentIndex = store.cardIndex();
          const currentItem = store.queue()[currentIndex];
          const currentScript = currentItem
            ? compiler.compile(currentItem, settings.playMode, store.languages())
            : null;
          const currentSegmentType = store.currentSegment()?.type;
          const nextSegmentIndex = currentScript && currentSegmentType
            ? Math.max(0, currentScript.segments.findIndex(segment => segment.type === currentSegmentType))
            : 0;
          patchState(store, {
            scripts: compileQueue(store.queue(), settings.playMode),
            segmentIndex: nextSegmentIndex,
          });
          engine.resetPrefetch();
          engine.prefetchWindow(currentIndex);
          if (store.downloadStatus() === 'done') patchState(store, { downloadStatus: 'idle' });
        }
        if (partial.shuffle !== undefined && store.status() !== 'idle') {
          const currentIndex = store.cardIndex();
          const played = store.queue().slice(0, currentIndex + 1);
          const remainingIds = new Set(store.queue().slice(currentIndex + 1).map(item => item.id));
          const remaining = settings.shuffle
            ? shuffleItems(store.queue().slice(currentIndex + 1))
            : store.rawQueue().filter(item => remainingIds.has(item.id));
          const queue = [...played, ...remaining];
          patchState(store, { queue, scripts: compileQueue(queue, settings.playMode) });
          engine.resetPrefetch();
          engine.prefetchWindow(currentIndex);
        }
      },
      restartWithShuffle(): void {
        const settings = { ...store.settings(), shuffle: true };
        patchState(store, { settings });
        localStorage.setItem(LISTEN_SETTINGS_KEY, JSON.stringify(settings));
        const queue = shuffleItems(store.rawQueue());
        patchState(store, {
          queue,
          scripts: compileQueue(queue, settings.playMode),
          cardIndex: 0,
          segmentIndex: 0,
          status: 'loading',
          errorMessage: null,
          sessionStartedAt: Date.now(),
        });
        engine.resetPrefetch();
        void engine.prepareWindow(0).finally(() => {
          if (store.status() !== 'loading') return;
          patchState(store, { status: 'playing' });
          engine.restart();
        });
      },
      resetToIdle(): void {
        engine.abortPlayback();
        patchState(store, {
          status: 'idle',
          segmentIndex: 0,
          errorMessage: null,
          selectedSource: ListenSource.Due,
        });
        localStorage.removeItem(LISTEN_SESSION_KEY);
        this.loadDueCards();
      },
    };
  }),
  withHooks({
    onInit(store) {
      const settings = loadSettings();
      patchState(store, { settings });
      store.initRunner();
      const session = loadSession();
      if (!session?.queue.length) {
        store.loadDueCards();
        return;
      }
      const compiler = inject(ScriptCompilerService);
      patchState(store, {
        playlistId: session.playlistId,
        languages: session.languages,
        rawQueue: session.queue,
        queue: session.queue,
        scripts: session.queue.map(item => compiler.compile(item, settings.playMode, session.languages)),
        cardIndex: Math.min(session.cardIndex, session.queue.length - 1),
        segmentIndex: 0,
        sourceLabel: session.sourceLabel,
        status: 'idle',
      });
    },
  }),
);
