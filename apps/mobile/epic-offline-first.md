# Epic: Full Offline-First Support
**Epic number:** 8  
**Tickets:** LC-100 → LC-115  
**Status:** Ready for planning  
**Estimated total points:** 47

---

## Context & current state

The codebase already has a partial offline story for cards and collections:

- `LocalDataService` persists cards and collections to IndexedDB/SQLite via `@ionic/storage-angular`
- `CardStore` and `CollectionStore` show cached data on load, then refresh from the API in the background
- `SyncService` queues writes when offline, processes them when connectivity returns, and exposes a `syncStatus` signal consumed by `SyncStatusComponent`
- `AiAudioCacheService` saves audio files to the Capacitor Filesystem after the first listen

**What is missing:**

1. **Stories are not persisted locally at all.** `StoryStore.loadStories()` always hits the API, sets `isLoading: true`, and shows skeleton cards every time — even if the user just visited the page seconds ago. There is no `LocalDataService.getStories()` / `setStories()`.
2. **`SyncService.forceSync()` is hardwired to cards only.** It re-fetches cards and saves them locally, but never stories or collections.
3. **`SyncService.execute()` uses a hardcoded `switch` statement** that knows about every operation type. The architecture plan says to make this handler-based (generic), but it hasn't been done yet. `StorySyncHandler` exists but is never called by `SyncService`.
4. **No background periodic refresh.** The app only syncs on app launch and when connectivity is restored after a drop. A user who leaves the app open all day never gets fresh data.
5. **No sync notifications.** There is no toast or banner telling the user "Synced successfully" or "Sync failed — will retry".
6. **`isLoading` shows on every navigation**, not just on first app load. The library page shows skeletons even when the store already holds data from a previous visit in the same session — or from local cache.
7. **No pull-to-refresh handler** that triggers a background sync without blocking the UI.
8. **`LocalDataService` has no story or SRS state slots.** Review progress is never persisted locally.
9. **No stale-while-revalidate (SWR) pattern.** The app doesn't distinguish between "first ever load (no cache)" and "cache exists, network just hasn't responded yet".
10. **No cache TTL or eviction policy.** Old stories sit in local storage forever with no mechanism to reclaim space.

---

## Design principles for this epic

- **Cache-first, network-in-background.** Data that exists locally must render immediately — zero loading skeletons for returning users unless there is truly nothing in cache.
- **Only the very first launch shows a full loading state.** Subsequent loads show stale data instantly while a background sync runs silently.
- **Silent sync unless something goes wrong.** Success toasts are shown only after the first sync or after a sync that was previously in an error state. Failures show a dismissable banner.
- **Retry is automatic and exponential.** Failed syncs are retried at 5 s, 15 s, 60 s, 5 min, and then only on the next connectivity event.
- **`SyncService` knows nothing about domain types.** Every feature registers its own `SyncHandler`. Core stays clean.
- **User-visible loading state has one trigger:** `isFirstLoad` — set on boot, cleared after the first successful cache read _or_ network fetch, whichever comes first.

---

## Story map

| Phase | Ticket | Title | Points |
|-------|--------|-------|--------|
| 1 — Core refactor | LC-100 | Decouple `SyncService` — generic handler registry | 3 |
| 1 — Core refactor | LC-101 | Extend `LocalDataService` with story & SRS slots | 2 |
| 2 — Stories offline | LC-102 | Offline-first `StoryStore` — cache-first load | 3 |
| 2 — Stories offline | LC-103 | Story data sync handler | 2 |
| 3 — Sync engine | LC-104 | `forceSync()` — full data refresh (stories + cards + collections) | 3 |
| 3 — Sync engine | LC-105 | Background periodic sync (app-level interval + visibility API) | 3 |
| 3 — Sync engine | LC-106 | Exponential backoff retry for failed sync operations | 2 |
| 4 — Loading UX | LC-107 | Stale-while-revalidate loading gate — eliminate redundant skeletons | 3 |
| 4 — Loading UX | LC-108 | Pull-to-refresh on Story Library and Vault — non-blocking | 2 |
| 5 — Notifications | LC-109 | Sync result toast / banner service | 3 |
| 5 — Notifications | LC-110 | Wire sync notifications into `SyncService` lifecycle | 2 |
| 6 — Audio & assets | LC-111 | Proactive audio pre-fetch after story sync | 3 |
| 6 — Audio & assets | LC-112 | Cache eviction — storage quota guard | 3 |
| 7 — SRS offline | LC-113 | Offline-first review sessions — persist SRS state locally | 5 |
| 7 — SRS offline | LC-114 | SRS sync handler — flush local ratings to server | 3 |
| 8 — Polish | LC-115 | Offline banner — global "You are offline" indicator | 2 |

---

---

## LC-100 · Decouple `SyncService` — generic handler registry

**Epic:** 8 — Offline First  
**Phase:** 1 — Core refactor  
**Points:** 3  
**Depends on:** —  

### Context

`SyncService.execute()` currently uses a `switch` on every known operation type, importing `CardApiService` and `CollectionApiService` directly. This violates the architecture plan: core must not import from features. `StorySyncHandler` exists but is never wired into `SyncService`.

### User story

As a developer, I want `SyncService` to dispatch operations through a registered handler map instead of a hardcoded switch statement, so that new features can add sync support without modifying core.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/core/services/sync.service.ts` | Replace `execute()` switch with handler dispatch; add `registerHandler()` |
| `apps/mobile/src/app/core/models/sync-handler.model.ts` | New: `SyncHandler` interface |
| `apps/mobile/src/app/features/vault/services/card-sync.handler.ts` | New: handles `CREATE_CARD`, `UPDATE_CARD`, `DELETE_CARD` |
| `apps/mobile/src/app/features/vault/services/collection-sync.handler.ts` | New: handles `CREATE_COLLECTION`, `UPDATE_COLLECTION`, `DELETE_COLLECTION` |
| `apps/mobile/src/app/features/vault/vault.providers.ts` | Register both vault handlers via `SyncService.registerHandler()` |
| `apps/mobile/src/app/features/stories/stories.providers.ts` | Register `StorySyncHandler` (already exists, just not wired) |

### Interface contract

```typescript
// core/models/sync-handler.model.ts
export interface SyncHandler {
  /** Must match the SyncOperation.type string exactly */
  readonly type: string;
  execute(payload: unknown): Promise<void>;
}
```

```typescript
// core/services/sync.service.ts — new shape
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly handlers = new Map<string, SyncHandler>();

  registerHandler(handler: SyncHandler): void {
    this.handlers.set(handler.type, handler);
  }

  private async execute(op: SyncOperation): Promise<void> {
    const handler = this.handlers.get(op.type);
    if (!handler) {
      console.warn(`[SyncService] No handler for type "${op.type}" — skipping`);
      return;
    }
    await handler.execute(op.payload);
  }
  // ... rest unchanged
}
```

### Acceptance criteria

- [ ] `SyncService` no longer imports `CardApiService`, `CollectionApiService`, or any feature type
- [ ] `SyncService.registerHandler()` stores the handler; `execute()` dispatches to it
- [ ] If no handler is found, the operation is skipped with a `console.warn` (not thrown — prevents queue stall)
- [ ] `CardSyncHandler` implements all three card operations; unit-tested
- [ ] `CollectionSyncHandler` implements all three collection operations; unit-tested
- [ ] `StorySyncHandler` is now actually invoked by `SyncService` when `type === 'GENERATE_STORY'`
- [ ] All existing E2E sync tests still pass
- [ ] `SyncService` has zero feature-level imports

---

---

## LC-101 · Extend `LocalDataService` with story & SRS slots

**Epic:** 8 — Offline First  
**Phase:** 1 — Core refactor  
**Points:** 2  
**Depends on:** —  

### Context

`LocalDataService` knows about cards and collections, but not stories. SRS state (pending ratings from review sessions) also has no local persistence slot, meaning offline review progress is lost on app kill.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/core/services/local-data.service.ts` | Add `getStories`, `setStories`, `getPendingSrsRatings`, `setPendingSrsRatings`, `clearStories` |

### New API

```typescript
// ── Stories ──────────────────────────────────────────────────
async getStories(userId: string): Promise<Story[]>
async setStories(userId: string, stories: Story[]): Promise<void>
async clearStories(userId: string): Promise<void>

// ── SRS pending ratings (offline review) ─────────────────────
async getPendingSrsRatings(userId: string): Promise<PendingSrsRating[]>
async setPendingSrsRatings(userId: string, ratings: PendingSrsRating[]): Promise<void>

// ── Metadata ─────────────────────────────────────────────────
async getLastSyncedAt(feature: 'stories' | 'cards' | 'collections'): Promise<string | null>
async setLastSyncedAt(feature: 'stories' | 'cards' | 'collections', ts: string): Promise<void>
```

Storage keys:
- `stories:{userId}` — `Story[]`
- `srs_ratings:{userId}` — `PendingSrsRating[]`  
- `last_synced_at:stories:{userId}`, `last_synced_at:cards:{userId}`, etc.

### Type additions

```typescript
// libs/shared/domain/src/lib/sync.types.ts (or inline in local-data.service.ts)
export interface PendingSrsRating {
  cardId: string;
  rating: number; // 0–5 SM-2 rating
  reviewedAt: string; // ISO timestamp
  sessionId: string;
}
```

### Acceptance criteria

- [ ] `getStories` / `setStories` work identically to `getCards` / `setCards`
- [ ] `getPendingSrsRatings` returns `[]` when no data exists (never throws)
- [ ] `getLastSyncedAt` accepts a feature name and returns the correct timestamp per feature
- [ ] `clearAllUserData` also removes story and SRS rating keys
- [ ] Unit tests for each new method

---

---

## LC-102 · Offline-first `StoryStore` — cache-first load

**Epic:** 8 — Offline First  
**Phase:** 2 — Stories offline  
**Points:** 3  
**Depends on:** LC-101  

### Context

`StoryStore.loadStories()` sets `isLoading: true` and shows skeleton cards on every call, even if the store already has data or local cache exists. This is the main UX regression to fix.

### User story

As a language learner, I want to see my stories instantly when I open the Story Library, even before the network responds, so that I never wait for content I already have.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/stories/store/story.store.ts` | Rewrite `loadStories()` to be cache-first; add `isFirstLoad` state |
| `apps/mobile/src/app/features/stories/pages/story-library/story-library.page.html` | Only show skeletons when `isFirstLoad()` is true |

### New store state shape

```typescript
interface StoryState {
  stories: Story[];
  isLoading: boolean;      // true only on very first load (no cache)
  isRefreshing: boolean;   // true during background network refresh (silent)
  isGenerating: boolean;
  error: string | null;
  generateError: string | null;
  hasEverLoaded: boolean;  // flipped to true after first cache read or network response
}
```

### New `loadStories()` logic

```typescript
loadStories(): void {
  void (async () => {
    const userId = uid();

    // 1. Show cache immediately if available — zero delay to user
    if (userId) {
      const cached = await localData.getStories(userId);
      if (cached.length > 0) {
        patchState(store, { stories: cached, hasEverLoaded: true });
        // DO NOT set isLoading — user sees content instantly
      }
    }

    // 2. If nothing in cache yet, show loading skeleton
    if (!store.hasEverLoaded()) {
      patchState(store, { isLoading: true });
    } else {
      patchState(store, { isRefreshing: true });
    }

    // 3. Background network refresh
    try {
      const stories = await firstValueFrom(api.getAll());
      patchState(store, {
        stories,
        isLoading: false,
        isRefreshing: false,
        hasEverLoaded: true,
      });
      if (userId) await localData.setStories(userId, stories);
      await localData.setLastSyncedAt('stories', new Date().toISOString());
    } catch {
      patchState(store, { isLoading: false, isRefreshing: false });
      // Only set error if we have nothing to show
      if (!store.hasEverLoaded()) {
        patchState(store, { error: 'Could not load stories. Check your connection.' });
      }
    }
  })();
},
```

### Template change

```html
<!-- Before: shows skeletons on every load -->
@if (loading()) { ... }

<!-- After: skeletons ONLY when there's truly nothing to show -->
@if (isLoading() && stories().length === 0) {
  <div class="loading-state"> ... </div>
}
@if (isRefreshing()) {
  <!-- Silent indicator: tiny spinner in top-right corner of page, no blocking skeleton -->
  <div class="sr-refresh-indicator"></div>
}
```

### Acceptance criteria

- [ ] On first ever app launch (no cache): `isLoading` is true, skeleton cards show
- [ ] On subsequent launches (cache exists): stories render immediately, `isLoading` is false, `isRefreshing` is true silently
- [ ] After the background network call completes, the story list updates in place without a flash of empty content
- [ ] If the user is offline and cache exists: stories render from cache, no error shown, no loading state
- [ ] If the user is offline and no cache: single error message (no skeleton loop)
- [ ] `isRefreshing` indicator: a subtle 2px linear progress bar at the top of the content area (not a full-screen spinner)
- [ ] `hasEverLoaded` persists in store state for the session (not across restarts — `isLoading` handles first-boot correctly via cache check)

---

---

## LC-103 · Story data sync handler

**Epic:** 8 — Offline First  
**Phase:** 2 — Stories offline  
**Points:** 2  
**Depends on:** LC-100, LC-101  

### Context

`StorySyncHandler` currently only handles `GENERATE_STORY` (queuing a generation request). We need a complementary `FETCH_STORIES` pull path and `DELETE_STORY` that also clears local cache.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/stories/services/story-sync.handler.ts` | Add `DELETE_STORY` operation type + handler |
| `apps/mobile/src/app/features/stories/store/story.store.ts` | `deleteStory()` enqueues `DELETE_STORY` if offline |
| `apps/mobile/src/app/core/services/sync.service.ts` | Add `'DELETE_STORY'` to `SyncOperationType` union |

### New operation type

```typescript
// DELETE_STORY payload: { storyId: string }
case 'DELETE_STORY':
  await firstValueFrom(api.remove(payload.storyId));
  break;
```

### `deleteStory()` updated offline path

```typescript
deleteStory(id: string): void {
  // Optimistic removal from store + local cache
  const next = store.stories().filter(s => s.id !== id);
  patchState(store, { stories: next });
  void audioCache.evict(id);

  const userId = uid();
  if (userId) void localData.setStories(userId, next);

  if (!navigator.onLine) {
    void syncService.enqueue({ type: 'DELETE_STORY', payload: { storyId: id } });
    return;
  }
  void firstValueFrom(api.remove(id)).catch(() => {
    // If delete fails when online, re-enqueue
    void syncService.enqueue({ type: 'DELETE_STORY', payload: { storyId: id } });
  });
},
```

### Acceptance criteria

- [ ] Deleting a story offline removes it from the store and local cache immediately
- [ ] A `DELETE_STORY` operation is enqueued and executed when connectivity returns
- [ ] On successful server delete, no further action needed (already removed from store)
- [ ] If the story ID is not found on the server (404), the operation is silently dequeued (not retried — it's already gone)
- [ ] `StorySyncHandler` is updated to handle both `GENERATE_STORY` and `DELETE_STORY`

---

---

## LC-104 · `forceSync()` — full data refresh

**Epic:** 8 — Offline First  
**Phase:** 3 — Sync engine  
**Points:** 3  
**Depends on:** LC-101, LC-102  

### Context

`SyncService.forceSync()` currently only refreshes cards. It needs to refresh all data types in parallel, update each feature's local cache, and report a unified sync result.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/core/services/sync.service.ts` | Rewrite `forceSync()` |
| `apps/mobile/src/app/features/stories/services/story-api.service.ts` | Confirm `getAll()` exists and is injectable here |

### Constraint

`SyncService` still cannot import feature types or API services directly after LC-100. The pull (read) path needs a similar registration mechanism to the write path.

### New pattern: `DataRefresher` registry

```typescript
// core/models/data-refresher.model.ts
export interface DataRefresher {
  /** Human-readable name for logging */
  readonly name: string;
  /** Called during forceSync — should save results to LocalDataService */
  refresh(userId: string): Promise<void>;
}
```

Each feature registers a `DataRefresher` in its providers alongside its sync handlers:

```typescript
// features/stories/services/story-data-refresher.ts
@Injectable({ providedIn: 'root' })
export class StoryDataRefresher implements DataRefresher {
  readonly name = 'stories';
  private readonly api = inject(StoryApiService);
  private readonly localData = inject(LocalDataService);
  private readonly storyStore = inject(StoryStore);

  async refresh(userId: string): Promise<void> {
    const stories = await firstValueFrom(this.api.getAll());
    await this.localData.setStories(userId, stories);
    await this.localData.setLastSyncedAt('stories', new Date().toISOString());
    // Update the live store so UI reflects fresh data without re-navigation
    this.storyStore.setStoriesFromSync(stories);
  }
}
```

### New `forceSync()` shape

```typescript
async forceSync(): Promise<SyncResult> {
  const userId = this.authService.currentUser()?.id;
  if (!userId) return { success: false, reason: 'not-authenticated' };

  this._status.set('syncing');
  const errors: string[] = [];

  // 1. Flush write queue first
  await this.processQueue();

  // 2. Pull all features in parallel
  await Promise.allSettled(
    [...this.refreshers.values()].map(async (refresher) => {
      try {
        await refresher.refresh(userId);
      } catch (err) {
        errors.push(refresher.name);
        console.error(`[SyncService] ${refresher.name} refresh failed`, err);
      }
    })
  );

  const success = errors.length === 0;
  this._status.set(success ? 'synced' : 'error');
  this._lastSyncResult.set({ success, failedFeatures: errors, ts: new Date().toISOString() });
  return { success, failedFeatures: errors };
}
```

### Acceptance criteria

- [ ] `forceSync()` refreshes stories, cards, and collections in parallel
- [ ] A failure in one feature does not block others (`Promise.allSettled`)
- [ ] `SyncService` does not import feature types — uses `DataRefresher` interface
- [ ] Each feature registers its refresher in its own providers file
- [ ] After `forceSync()`, all three features' stores and local caches are up to date
- [ ] `_lastSyncResult` signal is exposed for the notification system (LC-110)
- [ ] `forceSync()` is debounced — if called within 10 seconds of the last call, it no-ops and returns the last result

---

---

## LC-105 · Background periodic sync

**Epic:** 8 — Offline First  
**Phase:** 3 — Sync engine  
**Points:** 3  
**Depends on:** LC-104  

### Context

Currently the app only syncs on: (a) app launch and (b) connectivity restored. A user who keeps the app open will see data that is 30+ minutes stale. We need a periodic background sync that is invisible to the user unless something changes.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/app.component.ts` | Start periodic sync; listen to Page Visibility API |
| `apps/mobile/src/app/core/services/sync.service.ts` | `startPeriodicSync()` / `stopPeriodicSync()` |

### Strategy

- **Interval:** Every 5 minutes while the app is in the foreground
- **Visibility API:** Pause the interval when the document is hidden (app backgrounded); resume and immediately trigger a sync when it becomes visible again
- **Network guard:** Skip if `!navigator.onLine`
- **Idle guard:** Skip if the user is in an active review session (to avoid interrupting SRS UX)

```typescript
// app.component.ts addition
private startBackgroundSync(): void {
  // Periodic sync
  this.syncInterval = setInterval(async () => {
    if (navigator.onLine && !document.hidden) {
      await this.syncService.forceSync(); // debounced internally
    }
  }, 5 * 60 * 1000); // 5 minutes

  // Sync on tab/app becoming visible
  document.addEventListener('visibilitychange', this.onVisibilityChange);
}

private onVisibilityChange = async (): Promise<void> => {
  if (!document.hidden && navigator.onLine) {
    await this.syncService.forceSync();
  }
};
```

### Capacitor App plugin (for native)

On native, use `App.addListener('appStateChange', ...)` instead of the Visibility API:

```typescript
import { App } from '@capacitor/app';

App.addListener('appStateChange', async ({ isActive }) => {
  if (isActive && navigator.onLine) {
    await this.syncService.forceSync();
  }
});
```

### Acceptance criteria

- [ ] `startPeriodicSync()` is called once from `AppComponent.ngOnInit()` after auth
- [ ] Sync fires every 5 minutes while online and foregrounded
- [ ] Sync fires immediately when the app returns to the foreground after being backgrounded
- [ ] No sync fires while the device is offline
- [ ] The interval is cleared on `AppComponent.ngOnDestroy()`
- [ ] On native (Capacitor), uses `App.appStateChange` instead of the Visibility API
- [ ] On web, uses `document.visibilitychange`
- [ ] Sync does not show any UI indicator unless it results in an error (see LC-109)

---

---

## LC-106 · Exponential backoff retry

**Epic:** 8 — Offline First  
**Phase:** 3 — Sync engine  
**Points:** 2  
**Depends on:** LC-104  

### Context

Currently `SyncService` retries up to 5 times but with a fixed 50 ms delay between operations. For real network failures, this means all 5 retries are exhausted within milliseconds. We need exponential backoff with jitter.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/core/services/sync.service.ts` | Replace `retryCount >= MAX_RETRIES` logic; add `nextRetryAt` to `SyncOperation` |

### Backoff schedule (milliseconds)

| Attempt | Delay |
|---------|-------|
| 1 | 5,000 |
| 2 | 15,000 |
| 3 | 60,000 |
| 4 | 300,000 (5 min) |
| 5 | permanent `failed` |

Add jitter (±20%) to avoid thundering herd when multiple operations fail simultaneously.

```typescript
function backoffMs(retryCount: number): number {
  const delays = [5_000, 15_000, 60_000, 300_000];
  const base = delays[Math.min(retryCount, delays.length - 1)];
  const jitter = base * 0.2 * (Math.random() - 0.5);
  return base + jitter;
}
```

### New `SyncOperation` field

```typescript
export interface SyncOperation {
  // ... existing fields
  nextRetryAt: string | null; // ISO — null means "retry immediately"
}
```

`processQueue()` skips operations where `nextRetryAt` is in the future:

```typescript
const readyOps = ops.filter(op =>
  !op.nextRetryAt || new Date(op.nextRetryAt) <= new Date()
);
```

### Acceptance criteria

- [ ] Failed operations are not retried until their `nextRetryAt` timestamp
- [ ] Backoff schedule matches the table above (±20% jitter)
- [ ] After 5 failures, `status` is set to `'failed'` and the operation is excluded from future processing
- [ ] `processQueue()` only processes operations whose `nextRetryAt` has passed
- [ ] On connectivity restore, the queue is re-evaluated (due operations are processed immediately)
- [ ] Unit tests covering the backoff schedule and jitter range

---

---

## LC-107 · Stale-while-revalidate loading gate

**Epic:** 8 — Offline First  
**Phase:** 4 — Loading UX  
**Points:** 3  
**Depends on:** LC-102  

### Context

The same cache-first pattern applied to stories in LC-102 needs to be consistently applied to cards and collections. Also, the `isLoading` flag on `CardStore` is set to `true` on every `loadCards()` call even when the store already has data in memory.

### User story

As a user, I want the app to never show me a loading skeleton if I already saw the data in this session — I only accept loading on my very first time or after I manually request a refresh.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/vault/store/card.store.ts` | Add `hasEverLoaded` / `isRefreshing` to state; update `loadCards()` |
| `apps/mobile/src/app/features/vault/store/collection.store.ts` | Same pattern |
| `apps/mobile/src/app/features/vault/pages/vault/vault.page.html` | Use `isRefreshing` instead of `isLoading` for skeleton guard |

### New loading rules (applies to all three stores)

```
hasEverLoaded = false AND cache empty     → show full skeleton (isLoading = true)
hasEverLoaded = false AND cache has data  → render cache, silent refresh
hasEverLoaded = true                      → render existing state, silent refresh
```

A `hasEverLoaded` flag in each store is set to `true` the first time any data (cache or network) is successfully placed into the store. It is NOT persisted across app restarts — on a new boot, the cache check re-populates the store before `hasEverLoaded` is set, so the UX is seamless.

### Acceptance criteria

- [ ] Vault page never shows skeleton cards if the store already has data from this session
- [ ] Story Library never shows skeleton cards if the store already has data from this session
- [ ] `isLoading` is only `true` when `!hasEverLoaded && stories/cards.length === 0`
- [ ] `isRefreshing` is `true` during the background network call; a non-blocking 2 px progress bar is shown at the top of the content area
- [ ] Manual pull-to-refresh (LC-108) resets to `isRefreshing: true` (never `isLoading: true`)

---

---

## LC-108 · Pull-to-refresh — non-blocking

**Epic:** 8 — Offline First  
**Phase:** 4 — Loading UX  
**Points:** 2  
**Depends on:** LC-107  

### User story

As a user, I want to pull down on the Story Library or Vault to manually trigger a sync, so that I can get the latest data whenever I want without reloading the app.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/stories/pages/story-library/story-library.page.html` | Add `<ion-refresher>` |
| `apps/mobile/src/app/features/stories/pages/story-library/story-library.page.ts` | `onRefresh()` calls `syncService.forceSync()` |
| `apps/mobile/src/app/features/vault/pages/vault/vault.page.html` | Add `<ion-refresher>` |
| `apps/mobile/src/app/features/vault/pages/vault/vault.page.ts` | Same |

### Template pattern

```html
<ion-refresher slot="fixed" (ionRefresh)="onRefresh($event)">
  <ion-refresher-content
    pullingIcon="chevron-down-circle-outline"
    refreshingSpinner="crescent">
  </ion-refresher-content>
</ion-refresher>
```

```typescript
async onRefresh(event: CustomEvent): Promise<void> {
  await this.syncService.forceSync();
  (event.target as HTMLIonRefresherElement).complete();
}
```

### Acceptance criteria

- [ ] Pull-to-refresh is available on the Story Library page
- [ ] Pull-to-refresh is available on the Vault page
- [ ] Refresh completes (spinner hides) after `forceSync()` resolves, whether success or failure
- [ ] Refresher does NOT set `isLoading: true` — only `isRefreshing: true`
- [ ] If offline during pull-to-refresh: spinner completes after 1 second and a brief "You're offline" toast appears
- [ ] Pull-to-refresh is disabled while `isGenerating` is true (prevent accidental refresh mid-generation)

---

---

## LC-109 · Sync result notification service

**Epic:** 8 — Offline First  
**Phase:** 5 — Notifications  
**Points:** 3  
**Depends on:** LC-104  

### User story

As a user, I want to be notified when a background sync fails or when previously failed syncs succeed, so that I know my data is up to date without having to check manually.

### Files to create

| File | Purpose |
|------|---------|
| `apps/mobile/src/app/core/services/sync-notification.service.ts` | Decide when and what to notify |

### Notification rules

| Trigger | Notification |
|---------|-------------|
| First-ever successful sync (app just installed / logged in) | Toast: "✓ Everything is up to date" — 2.5 s, success colour |
| Sync success after a previous `error` state | Toast: "✓ Sync recovered — data is up to date" — 3 s, success colour |
| Sync failure (all features) | Persistent banner: "Sync failed — will retry automatically. [Retry now]" |
| Sync partial failure (some features) | Toast: "Some data couldn't sync. Will retry." — 4 s, warning colour |
| Operations flushed from queue successfully | Toast: "✓ X queued changes synced" — only if `count > 0` |
| Permanent failure (MAX_RETRIES exceeded) | Persistent banner: "A change couldn't be saved. [View details] [Retry]" |

**Do NOT notify on:**
- Every routine successful sync (would be constant noise)
- `isRefreshing` state transitions
- Audio pre-fetch events (LC-111)

### Implementation

```typescript
@Injectable({ providedIn: 'root' })
export class SyncNotificationService {
  private readonly toastCtrl = inject(ToastController);
  private readonly syncService = inject(SyncService);
  private previousStatus: SyncStatus = 'synced';

  init(): void {
    effect(() => {
      const current = this.syncService.syncStatus();
      const result = this.syncService.lastSyncResult();
      this.evaluateAndNotify(current, result);
      this.previousStatus = current;
    });
  }

  private async evaluateAndNotify(
    current: SyncStatus,
    result: SyncResult | null
  ): Promise<void> {
    if (current === 'synced' && this.previousStatus === 'error') {
      await this.showToast('✓ Sync recovered — data is up to date', 'success', 3000);
    }
    if (current === 'error' && this.previousStatus !== 'error') {
      await this.showPersistentBanner('Sync failed — will retry automatically');
    }
    if (current === 'synced' && result?.flushedCount > 0) {
      await this.showToast(`✓ ${result.flushedCount} queued changes synced`, 'success', 2500);
    }
  }
}
```

### Acceptance criteria

- [ ] `SyncNotificationService.init()` is called once from `AppComponent.ngOnInit()`
- [ ] Success-after-error toast shows within 500 ms of status transition
- [ ] Persistent error banner includes a "Retry now" button that calls `syncService.forceSync()`
- [ ] Notifications use the app's existing `IonToast` infrastructure (no third-party lib)
- [ ] "First sync ever" detection uses `LocalDataService.getLastSyncedAt()` — if null for all features, it's first sync
- [ ] No notification fires for routine successful syncs
- [ ] Unit tests: transition matrix covering all status change combinations

---

---

## LC-110 · Wire sync notifications into `SyncService`

**Epic:** 8 — Offline First  
**Phase:** 5 — Notifications  
**Points:** 2  
**Depends on:** LC-104, LC-109  

### Context

`SyncService` needs to expose the `lastSyncResult` signal and `flushedCount` data that `SyncNotificationService` (LC-109) reads.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/core/services/sync.service.ts` | Add `lastSyncResult` signal; track `flushedCount` in `processQueue()` |
| `apps/mobile/src/app/app.component.ts` | Initialise `SyncNotificationService` |

### New `SyncResult` type

```typescript
export interface SyncResult {
  success: boolean;
  failedFeatures: string[];
  flushedCount: number;  // operations successfully written to server
  ts: string;
}
```

### `processQueue()` update

Track how many operations are successfully dequeued and add to `SyncResult`.

### Acceptance criteria

- [ ] `SyncService.lastSyncResult` is a readonly signal of `SyncResult | null`
- [ ] `lastSyncResult` updates after every `forceSync()` or `processQueue()` completion
- [ ] `flushedCount` reflects the number of write operations successfully sent in this sync cycle
- [ ] `SyncNotificationService` is initialised in `AppComponent` before the first sync runs

---

---

## LC-111 · Proactive audio pre-fetch after story sync

**Epic:** 8 — Offline First  
**Phase:** 6 — Audio & assets  
**Points:** 3  
**Depends on:** LC-103, LC-104  

### Context

`AiAudioCacheService` already downloads audio on first listen. But users who are about to go offline can't listen at all until they've played a story once. We should proactively download audio for all uncached stories during a sync while on WiFi (or at least when on a non-metered connection).

### User story

As a language learner, I want my story audio to be available offline as soon as a story syncs, so that I can start listening immediately even when I lose connection.

### Files to create

| File | Purpose |
|------|---------|
| `apps/mobile/src/app/features/stories/services/story-audio-prefetch.service.ts` | Coordinates background audio downloads |

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/stories/services/story-data-refresher.ts` | After refresh, trigger `StoryAudioPrefetchService.prefetchAll()` |

### Pre-fetch strategy

```typescript
@Injectable({ providedIn: 'root' })
export class StoryAudioPrefetchService {
  private readonly audioCache = inject(AiAudioCacheService);
  private readonly storyStore = inject(StoryStore);

  async prefetchAll(): Promise<void> {
    if (!navigator.onLine) return;

    // Only pre-fetch on non-metered connections (WiFi) on native
    if (Capacitor.isNativePlatform()) {
      const { connectionType } = await Network.getStatus();
      if (connectionType !== 'wifi') return; // Skip on cellular
    }

    const stories = this.storyStore.stories();
    const uncached = await this.filterUncached(stories);

    // Download one at a time to avoid saturating bandwidth
    for (const story of uncached) {
      if (!navigator.onLine) break; // Abort if we go offline mid-prefetch
      if (story.audioUrl) {
        await this.audioCache.getOrDownload(story.id, story.audioUrl).catch(() => null);
      }
    }
  }

  private async filterUncached(stories: Story[]): Promise<Story[]> {
    const results = await Promise.all(
      stories.map(async (s) => {
        const cached = await this.audioCache.getFromCache(s.id);
        return cached ? null : s;
      })
    );
    return results.filter((s): s is Story => s !== null);
  }
}
```

### Acceptance criteria

- [ ] Audio pre-fetch is triggered after every successful story data refresh
- [ ] Pre-fetch only runs on WiFi on native devices
- [ ] Pre-fetch runs on any connection on web (no network type detection available)
- [ ] Pre-fetch is sequential (not parallel) to avoid bandwidth saturation
- [ ] Pre-fetch aborts immediately if the device goes offline mid-run
- [ ] Pre-fetch never blocks the story list from rendering — it runs fully in the background
- [ ] If `audioUrl` is null for a story, that story is skipped silently
- [ ] Pre-fetch progress is NOT shown in the UI (completely silent)

---

---

## LC-112 · Cache eviction — storage quota guard

**Epic:** 8 — Offline First  
**Phase:** 6 — Audio & assets  
**Points:** 3  
**Depends on:** LC-111  

### Context

Audio files are ~2–5 MB each. With unlimited growth, the cache can fill device storage. We need an eviction policy.

### User story

As a user with limited device storage, I want the app to automatically clean up old audio I haven't listened to, so that it doesn't silently fill my phone's storage.

### Files to create

| File | Purpose |
|------|---------|
| `apps/mobile/src/app/features/ai/audio/audio-cache-eviction.service.ts` | LRU eviction logic |

### Eviction policy

- **Hard limit:** 200 MB total audio cache (configurable via environment)
- **Strategy:** LRU (Least Recently Used) based on `lastListenedAt` from the store
- **Trigger:** Run after every pre-fetch batch completes
- **Watermarks:** Start evicting at 180 MB; stop at 150 MB (hysteresis to avoid churn)

```typescript
@Injectable({ providedIn: 'root' })
export class AudioCacheEvictionService {
  private readonly SOFT_LIMIT_BYTES = 180 * 1024 * 1024; // 180 MB
  private readonly TARGET_BYTES = 150 * 1024 * 1024;     // 150 MB

  async evictIfNeeded(stories: Story[]): Promise<void> {
    const currentSize = await this.audioCache.getCacheSize();
    if (currentSize < this.SOFT_LIMIT_BYTES) return;

    // Sort by last listened — evict oldest first
    const sorted = [...stories]
      .filter(s => s.lastListenedAt !== null)
      .sort((a, b) =>
        new Date(a.lastListenedAt!).getTime() - new Date(b.lastListenedAt!).getTime()
      );

    let freed = 0;
    for (const story of sorted) {
      if (currentSize - freed <= this.TARGET_BYTES) break;
      const cached = await this.audioCache.getFromCache(story.id);
      if (cached) {
        await this.audioCache.evict(story.id);
        freed += await this.estimateSize(story); // ~estimate from audioDurationMs
      }
    }
  }
}
```

### Acceptance criteria

- [ ] Eviction runs after every pre-fetch batch
- [ ] Stories are evicted LRU based on `lastListenedAt`
- [ ] Never evicts a story the user is actively listening to (check against `StoryStore.currentlyPlayingId` once that signal exists; skip for now)
- [ ] Stories with `lastListenedAt === null` (never listened) are evicted last
- [ ] The soft limit and target are configurable via `environment.ts`
- [ ] Total cache size is logged at debug level after eviction
- [ ] Unit tests: eviction selects the oldest stories first

---

---

## LC-113 · Offline-first review sessions — persist SRS state locally

**Epic:** 8 — Offline First  
**Phase:** 7 — SRS offline  
**Points:** 5  
**Depends on:** LC-101  

### Context

If a user starts a review session and loses connectivity mid-session, all completed ratings are lost because `ReviewStore` calls the API synchronously after each card. This is the most data-loss-prone gap in the current implementation.

### User story

As a language learner, I want my review progress to be saved even if I lose connection during a session, so that I never have to redo cards I already reviewed.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/review/store/review.store.ts` | Buffer ratings locally; flush to API when online |
| `apps/mobile/src/app/features/review/services/srs-sync.handler.ts` | New: `FLUSH_SRS_RATINGS` operation handler |
| `apps/mobile/src/app/features/review/review.providers.ts` | Register `SrsSyncHandler` |

### New flow

When the user rates a card:

1. Apply SM-2 update to the in-memory card state immediately (optimistic)
2. Append `PendingSrsRating` to `LocalDataService.getPendingSrsRatings()`
3. If online: attempt API flush immediately; on success, remove from pending list
4. If offline: leave in pending list; enqueue `FLUSH_SRS_RATINGS` sync operation

On session complete or app resume: attempt to flush all pending ratings.

```typescript
// review.store.ts — rateCard() update
rateCard(cardId: string, rating: number): void {
  // 1. Optimistic in-store update (SM-2 calculation unchanged)
  // ... existing SM-2 logic ...

  // 2. Buffer locally
  const pendingRating: PendingSrsRating = {
    cardId,
    rating,
    reviewedAt: new Date().toISOString(),
    sessionId: store.currentSessionId(),
  };
  void localData.getPendingSrsRatings(userId).then(async (existing) => {
    await localData.setPendingSrsRatings(userId, [...existing, pendingRating]);
  });

  // 3. Flush if online
  if (navigator.onLine) {
    void this.flushRating(pendingRating);
  }
  // If offline, SrsSyncHandler will flush on reconnect
},
```

### Acceptance criteria

- [ ] Rating a card always writes to local buffer first, API second
- [ ] Going offline during a review session does not interrupt the session or show an error
- [ ] On session complete while offline, all ratings are persisted locally
- [ ] When connectivity returns, `SrsSyncHandler` sends all buffered ratings to the API
- [ ] On successful flush, ratings are removed from the local buffer
- [ ] Duplicate-rating guard: if a card is rated twice offline (bug or retry), only the most recent rating for that card is sent
- [ ] `ReviewStore.sessionComplete()` includes ratings flushed count in its summary signal
- [ ] Unit test: rate 5 cards offline; restore connectivity; verify all 5 ratings sent to API

---

---

## LC-114 · SRS sync handler — flush local ratings to server

**Epic:** 8 — Offline First  
**Phase:** 7 — SRS offline  
**Points:** 3  
**Depends on:** LC-113  

### Context

Companion handler for LC-113. Sends buffered SRS ratings to the API when connectivity is restored.

### Files to create

| File | Purpose |
|------|---------|
| `apps/mobile/src/app/features/review/services/srs-sync.handler.ts` | `FLUSH_SRS_RATINGS` handler |

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/review/review.providers.ts` | Register `SrsSyncHandler` |
| `apps/mobile/src/app/core/services/sync.service.ts` | Add `'FLUSH_SRS_RATINGS'` to `SyncOperationType` |

### Implementation

```typescript
@Injectable({ providedIn: 'root' })
export class SrsSyncHandler implements SyncHandler {
  readonly type = 'FLUSH_SRS_RATINGS' as const;

  async execute(payload: { userId: string }): Promise<void> {
    const pending = await this.localData.getPendingSrsRatings(payload.userId);
    if (pending.length === 0) return;

    // Deduplicate: keep latest rating per cardId
    const deduped = Object.values(
      pending.reduce((acc, r) => {
        const existing = acc[r.cardId];
        if (!existing || r.reviewedAt > existing.reviewedAt) acc[r.cardId] = r;
        return acc;
      }, {} as Record<string, PendingSrsRating>)
    );

    // Batch POST to API
    await firstValueFrom(this.cardApi.batchRateSrs(deduped));

    // Clear buffer
    await this.localData.setPendingSrsRatings(payload.userId, []);

    // Reload cards to reflect updated SRS state
    this.cardStore.loadCards();
  }
}
```

### API requirement

`CardApiService` needs a `batchRateSrs(ratings: PendingSrsRating[]): Observable<void>` method, and the NestJS backend needs a corresponding `POST /cards/srs/batch` endpoint.

### Acceptance criteria

- [ ] `SrsSyncHandler` correctly deduplicates ratings before sending
- [ ] On successful batch flush, local buffer is cleared
- [ ] On partial failure (some ratings rejected), successful ones are removed; failed ones remain
- [ ] After flush, `CardStore.loadCards()` is triggered to refresh SRS state in the UI
- [ ] `POST /cards/srs/batch` accepts `PendingSrsRating[]` and processes them server-side
- [ ] Unit test: 3 pending ratings including 1 duplicate — verify 2 API calls sent, not 3

---

---

## LC-115 · Global offline banner

**Epic:** 8 — Offline First  
**Phase:** 8 — Polish  
**Points:** 2  
**Depends on:** LC-105  

### User story

As a user, I want a clear but unobtrusive indicator when I'm offline, so that I understand why content isn't refreshing without being blocked from using the app.

### Files to create

| File | Purpose |
|------|---------|
| `apps/mobile/src/app/shared/components/offline-banner/offline-banner.component.ts` | Banner component |
| `apps/mobile/src/app/shared/components/offline-banner/offline-banner.component.html` | Template |
| `apps/mobile/src/app/shared/components/offline-banner/offline-banner.component.scss` | Styles |

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/app.component.html` | Add `<lc-offline-banner>` below `<ion-router-outlet>` |
| `apps/mobile/src/app/core/services/network.service.ts` | (Create if not exists) Expose `isOnline` signal |

### Design spec

- **Position:** Fixed, top of screen, below the Ionic header (z-index below modals)
- **Appearance:** Amber/warning background (`#FEF3C7`), dark amber text (`#92400E`), small WiFi-off icon + "You're offline — showing saved data"
- **Animation:** Slides down from top on appear; slides back up on dismiss
- **Auto-dismiss:** Dismisses automatically when connectivity is restored, after a 1-second delay (so user sees the reconnection moment)
- **Height:** 36 px — minimal footprint, never blocks main content

```typescript
@Component({ selector: 'lc-offline-banner', ... })
export class OfflineBannerComponent {
  private readonly networkService = inject(NetworkService);
  readonly isVisible = this.networkService.isOffline;
}
```

```html
@if (isVisible()) {
  <div class="offline-banner" @slideDown>
    <ion-icon name="cloud-offline-outline"></ion-icon>
    <span>You're offline — showing saved data</span>
  </div>
}
```

### Acceptance criteria

- [ ] Banner appears within 500 ms of losing connectivity
- [ ] Banner disappears within 1.5 s of regaining connectivity
- [ ] Banner does not block any interactive elements (no overlay, pointer-events: none on the banner's container when hidden)
- [ ] Banner is accessible: `role="status"` and `aria-live="polite"`
- [ ] Banner is tested on both iOS and Android for correct z-index positioning below native status bar
- [ ] Banner is NOT shown during the first 3 seconds of app launch (avoid flash on slow-boot)

---

## Implementation order

```
Phase 1 (foundation — unblocks everything)
  LC-100  Decouple SyncService handler registry
  LC-101  Extend LocalDataService with story & SRS slots

Phase 2 (stories offline — highest user impact)
  LC-102  Offline-first StoryStore (cache-first load)
  LC-103  Story data sync handler (DELETE_STORY)

Phase 3 (sync engine)
  LC-104  forceSync() full data refresh + DataRefresher registry
  LC-106  Exponential backoff retry
  LC-105  Background periodic sync

Phase 4 (loading UX)
  LC-107  SWR loading gate — eliminate redundant skeletons
  LC-108  Pull-to-refresh (non-blocking)

Phase 5 (notifications — can parallel with Phase 4)
  LC-109  Sync result notification service
  LC-110  Wire notifications into SyncService

Phase 6 (audio & storage)
  LC-111  Proactive audio pre-fetch
  LC-112  Cache eviction — storage quota guard

Phase 7 (SRS offline — highest data integrity impact)
  LC-113  Offline review sessions — local SRS buffer
  LC-114  SRS sync handler — batch flush

Phase 8 (polish)
  LC-115  Global offline banner
```

---

## Non-goals for this epic

- Service Worker / PWA background sync (`BackgroundSync` API) — deferred to a future PWA-specific epic
- Conflict resolution for concurrent edits from multiple devices — last-write-wins is acceptable at this scale
- Offline story generation — generation requires the AI backend and cannot run on-device
- Peer-to-peer / local network sync
- Selective sync (choosing which stories to keep offline) — all stories sync by default
- Push notifications for sync events (vs in-app toasts) — platform push is a separate epic

---

## Testing requirements

Every ticket in this epic must include:

1. **Unit tests** for the service/store logic (mock `LocalDataService`, mock `Network`)
2. **Integration test** that starts with no network, performs user actions, restores network, and verifies data integrity
3. **Manual test matrix** covering:
   - Cold start with no cache (first install)
   - Cold start with existing cache, offline
   - Cold start with existing cache, online
   - Go offline mid-session, perform actions, go online
   - Force-quit app mid-sync, re-open
