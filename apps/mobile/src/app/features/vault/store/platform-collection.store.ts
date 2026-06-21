import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { EMPTY, pipe, switchMap, tap, catchError, firstValueFrom } from 'rxjs';
import type {
  PlatformCollectionSummary,
  PlatformCollectionDetail,
  CefrLevel,
  AdoptPlatformCollectionResult,
} from '@lingua-card/shared/domain';
import { PlatformCollectionApiService } from '../services/platform-collection-api.service';
import { CollectionStore } from './collection.store';

export interface TopicShelf {
  topic: string;
  collections: PlatformCollectionSummary[];
}

export function ringStyle(knownCount: number, wordCount: number): string {
  if (!wordCount) return 'background: rgba(45,90,78,0.14)';
  const deg = Math.round((knownCount / wordCount) * 360);
  return `background: conic-gradient(var(--lc-brand) 0 ${deg}deg, rgba(45,90,78,0.14) ${deg}deg 360deg)`;
}

const LEVEL_STORAGE_KEY = 'lc_explore_level';

function readStoredLevel(): CefrLevel | 'all' | null {
  try {
    const v = localStorage.getItem(LEVEL_STORAGE_KEY);
    if (v === 'all' || ['A1', 'A2', 'B1', 'B2', 'C1'].includes(v ?? '')) {
      return v as CefrLevel | 'all';
    }
  } catch { /* SSR / private browsing */ }
  return null;
}

function writeStoredLevel(level: CefrLevel | 'all'): void {
  try { localStorage.setItem(LEVEL_STORAGE_KEY, level); } catch { /* ignore */ }
}

export type AdoptEvent =
  | { type: 'success'; result: AdoptPlatformCollectionResult }
  | { type: 'error' };

interface PlatformCollectionState {
  collections: PlatformCollectionSummary[];
  levelCounts: Record<CefrLevel, number>;
  suggestedLevel: CefrLevel;
  selectedLevel: CefrLevel | 'all';
  search: string;
  isLoading: boolean;
  hasEverLoaded: boolean;
  /** Detail cache keyed by id */
  detailCache: Record<string, PlatformCollectionDetail>;
  detailLoading: boolean;
  adoptingId: string | null;
  /** Last adopt outcome — components react to this signal instead of passing callbacks. */
  lastAdoptEvent: AdoptEvent | null;
  error: string | null;
}

const initialState: PlatformCollectionState = {
  collections: [],
  levelCounts: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 },
  suggestedLevel: 'A1',
  selectedLevel: 'A1',
  search: '',
  isLoading: false,
  hasEverLoaded: false,
  detailCache: {},
  detailLoading: false,
  adoptingId: null,
  lastAdoptEvent: null,
  error: null,
};

export const PlatformCollectionStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),

  withComputed(({ collections, selectedLevel, search }) => ({
    visible: computed(() => {
      const level = selectedLevel();
      const q = search().trim().toLowerCase();
      return collections().filter(c => {
        const levelMatch = level === 'all' || c.level === level;
        const searchMatch = !q || c.title.toLowerCase().includes(q) || c.topic.toLowerCase().includes(q);
        return levelMatch && searchMatch;
      });
    }),
  })),

  withComputed(({ visible }) => ({
    shelves: computed((): TopicShelf[] => {
      const map = new Map<string, PlatformCollectionSummary[]>();
      for (const c of visible()) {
        const list = map.get(c.topic) ?? [];
        list.push(c);
        map.set(c.topic, list);
      }
      // Sort topics by number of matching collections (most first)
      return Array.from(map.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .map(([topic, cols]) => ({ topic, collections: cols }));
    }),
  })),

  withMethods((store) => {
    const api = inject(PlatformCollectionApiService);
    const collectionStore = inject(CollectionStore);

    return {
      loadCollections: rxMethod<void>(
        pipe(
          tap(() => patchState(store, { isLoading: true, error: null })),
          switchMap(() =>
            api.getAll().pipe(
              tap(res => {
                const defaultLevel = res.suggestedLevel ?? 'A1';
                // Priority: 1) user's in-session override (if it still has results), 2) persisted, 3) suggested, 4) 'all'
                const candidateLevel = store.hasEverLoaded()
                  ? store.selectedLevel()
                  : (readStoredLevel() ?? defaultLevel);
                // If the candidate level has zero collections, fall back to 'all'
                const levelHasResults =
                  candidateLevel === 'all' ||
                  (res.levelCounts[candidateLevel as CefrLevel] ?? 0) > 0;
                const selectedLevel = levelHasResults ? candidateLevel : 'all';
                patchState(store, {
                  collections: res.collections,
                  levelCounts: res.levelCounts,
                  suggestedLevel: res.suggestedLevel,
                  selectedLevel,
                  isLoading: false,
                  hasEverLoaded: true,
                });
              }),
              catchError(() => {
                patchState(store, { isLoading: false, error: 'Failed to load collections' });
                return EMPTY;
              }),
            ),
          ),
        ),
      ),

      loadDetail: rxMethod<string>(
        pipe(
          tap(() => patchState(store, { detailLoading: true })),
          switchMap(id =>
            api.getById(id).pipe(
              tap(detail => {
                patchState(store, {
                  detailCache: { ...store.detailCache(), [id]: detail },
                  detailLoading: false,
                });
              }),
              catchError(() => {
                patchState(store, { detailLoading: false });
                return EMPTY;
              }),
            ),
          ),
        ),
      ),

      setLevel(level: CefrLevel | 'all'): void {
        writeStoredLevel(level);
        patchState(store, { selectedLevel: level });
      },

      setSearch(search: string): void {
        patchState(store, { search });
      },

      adopt: rxMethod<string>(
        pipe(
          tap(id => patchState(store, { adoptingId: id, lastAdoptEvent: null })),
          switchMap(id =>
            api.adopt(id).pipe(
              tap(result => {
                const cache = store.detailCache();
                // Drop the detail cache entry so next visit re-fetches with
                // accurate per-word knownToUser flags post-adoption.
                const { [id]: _dropped, ...remainingCache } = cache;
                patchState(store, {
                  adoptingId: null,
                  lastAdoptEvent: { type: 'success', result },
                  collections: store.collections().map(c =>
                    c.id === id
                      ? { ...c, adoptionStatus: 'adopted', adoptedCollectionId: result.collection.id }
                      : c,
                  ),
                  detailCache: remainingCache,
                });
                collectionStore.loadCollections();
              }),
              catchError(() => {
                patchState(store, { adoptingId: null, lastAdoptEvent: { type: 'error' } });
                return EMPTY;
              }),
            ),
          ),
        ),
      ),

      /**
       * Promise-returning variant of `adopt` for imperative callers (e.g. the
       * onboarding flow) that need to await the outcome. Applies the same state
       * patches as `adopt` and resolves with the resulting `AdoptEvent`.
       */
      async adoptAndWait(id: string): Promise<AdoptEvent> {
        patchState(store, { adoptingId: id, lastAdoptEvent: null });
        try {
          const result = await firstValueFrom(api.adopt(id));
          const cache = store.detailCache();
          const { [id]: _dropped, ...remainingCache } = cache;
          const event: AdoptEvent = { type: 'success', result };
          patchState(store, {
            adoptingId: null,
            lastAdoptEvent: event,
            collections: store.collections().map(c =>
              c.id === id
                ? { ...c, adoptionStatus: 'adopted', adoptedCollectionId: result.collection.id }
                : c,
            ),
            detailCache: remainingCache,
          });
          collectionStore.loadCollections();
          return event;
        } catch {
          const event: AdoptEvent = { type: 'error' };
          patchState(store, { adoptingId: null, lastAdoptEvent: event });
          return event;
        }
      },
    };
  }),

  withHooks({
    onInit() { /* Lazy — loaded on first Explore tab visit */ },
  }),
);
