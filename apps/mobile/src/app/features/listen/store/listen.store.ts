import { computed, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { concatMap, from, map, Subject, timer } from 'rxjs';
import {
  AudioSegment,
  Card,
  PlaybackScript,
  PlayerSettings,
  PlayMode,
} from '@lingua-card/shared/domain';
import { CardStore } from '../../vault/store/card.store';
import { WordAudioService } from '../../../shared/audio/word-audio.service';
import { ScriptCompilerService } from '../services/script-compiler.service';
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
  SilenceDuration,
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
    const wordAudio = inject(WordAudioService);
    const cardStore = inject(CardStore);
    const destroyRef = inject(DestroyRef);

    // ── Segment pipeline ────────────────────────────────────────────────────────
    //
    // ROOT CAUSE OF next/previous DESYNC:
    //
    // concatMap queues inner observables — it never cancels the in-flight one when
    // a new emission arrives. Tapping Next mid-word means:
    //   1. The current playAsPromise() keeps running (Audio element has no cancel handle).
    //   2. A new segment is also queued behind it in concatMap.
    //   3. When the stale audio finally resolves, concatMap's next() callback reads the
    //      *current* (already-advanced) store state and advances the segment index again,
    //      playing segments from the new card out of order.
    //
    // FIX — generation counter:
    // Every call that starts a new playback sequence (next, previous, start, skip, retry,
    // restart) increments `_generation`. Each segment emission carries the generation at
    // the time it was emitted (in the `tag` property). The concatMap subscriber checks the
    // tag against the current generation before acting. Stale completions become no-ops.
    //
    // The Subject itself is also completed-and-replaced on each navigation so concatMap's
    // queue is fully drained — no stale segment ever starts executing after a skip.

    interface TaggedSegment {
      segment: AudioSegment;
      generation: number;
    }

    let _generation = 0;
    let _subject$ = new Subject<TaggedSegment>();

    /** Stop web-speech + hard-abort any in-flight utterance, then increment generation. */
    function abortAndAdvance(): number {
      wordAudio.stop();
      return ++_generation;
    }

    /** Drain the current pipeline and create a fresh one subscribed to the runner. */
    function resetPipeline(runnerFn: (s$: Subject<TaggedSegment>) => void): void {
      // Complete the old subject so concatMap's queue is fully flushed.
      const old = _subject$;
      _subject$ = new Subject<TaggedSegment>();
      runnerFn(_subject$);
      old.complete();
    }

    function emitNextSegment(gen: number): void {
      const script = store.currentScript();
      const seg = store.currentSegment();
      if (script && seg) _subject$.next({ segment: seg, generation: gen });
    }

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

    /** Wire up the concatMap runner to a given subject. Called once on init and
     *  re-called each time the pipeline is reset (so the new subject gets a subscriber). */
    function subscribeRunner(subject$: Subject<TaggedSegment>): void {
      subject$.pipe(
        // concatMap plays each segment in order and carries the generation through
        // so the subscriber next() can verify the completion still belongs to the
        // active playback sequence — not a stale one triggered by stop()/cancel().
        concatMap(({ segment, generation }: TaggedSegment) => {
          // Entry guard: generation already moved on before this slot even started.
          if (generation !== _generation) {
            return from(Promise.resolve()).pipe(map(() => generation));
          }

          if (segment.type === 'silence') {
            return timer(segment.durationMs ?? SilenceDuration.AfterWord).pipe(
              map(() => generation),
            );
          }
          const lang = segment.lang === 'de' ? 'de-DE' : 'en-US';
          return from(wordAudio.playAsPromise(segment.text, lang)).pipe(
            map(() => generation),
          );
        }),
        takeUntilDestroyed(destroyRef),
      ).subscribe({
        next: (gen: number) => {
          // Exit guard: the generation that started this segment no longer matches
          // the current one. This fires when speechSynthesis.cancel() resolves the
          // fallback promise, or when lc-stop resolves _playAndWait, after
          // next()/previous()/skip() has already incremented _generation.
          // Without this guard the subscriber would read the NEW card's state and
          // corrupt its segmentIndex before the new card's own emission runs.
          if (gen !== _generation) return;

          if (store.status() !== 'playing') return;
          const script = store.currentScript();
          const segIdx = store.segmentIndex();
          if (!script || segIdx >= script.segments.length) return;

          if (segIdx < script.segments.length - 1) {
            patchState(store, { segmentIndex: segIdx + 1 });
            emitNextSegment(gen);
          } else {
            const cardIdx = store.cardIndex();
            const queueLen = store.queue().length;
            if (cardIdx >= queueLen - 1) {
              if (store.settings().repeat) {
                patchState(store, { cardIndex: 0, segmentIndex: 0, status: 'playing' });
                emitNextSegment(gen);
              } else {
                patchState(store, { status: 'complete' });
              }
            } else {
              patchState(store, { cardIndex: cardIdx + 1, segmentIndex: 0 });
              saveSession();
              emitNextSegment(gen);
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
    }

    return {
      initRunner(): void {
        subscribeRunner(_subject$);
      },

      stopAudio(): void {
        wordAudio.stop();
      },

      loadQueue(cards: Card[], label: string): void {
        abortAndAdvance();
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
        localStorage.removeItem(LISTEN_SESSION_KEY);

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

      start(opts: { shuffle?: boolean } = {}): void {
        if (opts.shuffle !== undefined) {
          const settings = { ...store.settings(), shuffle: opts.shuffle };
          patchState(store, { settings });
          localStorage.setItem(LISTEN_SETTINGS_KEY, JSON.stringify(settings));
        }
        const gen = abortAndAdvance();
        const queue = store.settings().shuffle ? shuffleArray(store.rawQueue()) : [...store.rawQueue()];
        const scripts = compileQueue(queue, store.settings().playMode);
        patchState(store, { queue, scripts, cardIndex: 0, segmentIndex: 0, status: 'playing', errorMessage: null });
        resetPipeline(subscribeRunner);
        emitNextSegment(gen);
      },

      pause(): void {
        // Do not increment generation — resume() will re-emit the current segment.
        patchState(store, { status: 'paused' });
      },

      resume(): void {
        if (store.status() !== 'paused') return;
        patchState(store, { status: 'playing', errorMessage: null });
        // Re-use the current generation — we're continuing the same sequence.
        emitNextSegment(_generation);
      },

      next(): void {
        const idx = store.cardIndex();
        const queueLen = store.queue().length;
        if (idx >= queueLen - 1) return;
        const wasPlaying = store.status() === 'playing';
        // Abort in-flight audio and get the new generation BEFORE updating state,
        // so emitNextSegment emits with the correct new generation tag.
        const gen = abortAndAdvance();
        patchState(store, { cardIndex: idx + 1, segmentIndex: 0 });
        saveSession();
        if (wasPlaying) {
          resetPipeline(subscribeRunner);
          emitNextSegment(gen);
        }
      },

      previous(): void {
        const idx = store.cardIndex();
        if (idx <= 0) return;
        const wasPlaying = store.status() === 'playing';
        const gen = abortAndAdvance();
        patchState(store, { cardIndex: idx - 1, segmentIndex: 0 });
        saveSession();
        if (wasPlaying) {
          resetPipeline(subscribeRunner);
          emitNextSegment(gen);
        }
      },

      retrySegment(): void {
        const gen = abortAndAdvance();
        patchState(store, { status: 'playing', errorMessage: null });
        resetPipeline(subscribeRunner);
        emitNextSegment(gen);
      },

      skipCard(): void {
        const idx = store.cardIndex();
        const queueLen = store.queue().length;
        if (idx >= queueLen - 1) {
          abortAndAdvance();
          patchState(store, { status: 'complete' });
          return;
        }
        const gen = abortAndAdvance();
        patchState(store, { cardIndex: idx + 1, segmentIndex: 0, status: 'playing', errorMessage: null });
        resetPipeline(subscribeRunner);
        emitNextSegment(gen);
      },

      updateSettings(partial: Partial<PlayerSettings>): void {
        const settings = { ...store.settings(), ...partial };
        patchState(store, { settings });
        localStorage.setItem(LISTEN_SETTINGS_KEY, JSON.stringify(settings));

        if ('playMode' in partial) {
          const playedIdx = store.cardIndex();
          const remaining = store.rawQueue().slice(playedIdx + 1);
          const recompiled = compileQueue(remaining, settings.playMode);
          const newScripts = [...store.scripts().slice(0, playedIdx + 1), ...recompiled];
          patchState(store, { scripts: newScripts });
        }
      },

      restartWithShuffle(): void {
        const settings = { ...store.settings(), shuffle: true };
        patchState(store, { settings });
        localStorage.setItem(LISTEN_SETTINGS_KEY, JSON.stringify(settings));

        const gen = abortAndAdvance();
        const queue = shuffleArray(store.rawQueue());
        const scripts = compileQueue(queue, settings.playMode);
        patchState(store, { queue, scripts, cardIndex: 0, segmentIndex: 0, status: 'playing', errorMessage: null });
        resetPipeline(subscribeRunner);
        emitNextSegment(gen);
      },

      resetToIdle(): void {
        abortAndAdvance();
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
