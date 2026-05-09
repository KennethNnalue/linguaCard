# LinguaCard — User Stories Bundle
## LC-020 · LC-021 · LC-022 · LC-023

---

# LC-020 — Authentication (Login, Register, Forgot Password, Google Sign-In)

## Story
**As a** new or returning user,
**I want to** register with my name and email, sign in, reset my password, and optionally sign in with Google,
**So that** my vocabulary, collections, progress, and SRS data are private, persistent, and accessible across all my devices.

## Context for Claude Code
Open `design-reference.html` screens **08 · Login**, **08a · Register**, **08b · Forgot password**. All auth screens share the same visual language: centre-aligned logo mark, Lora app name, DM Sans fields, brand-green primary button, error pill in red. There is no top navigation bar on auth screens — they are outside the main app shell.

## Current state
The app currently has no authentication. Every user who opens the app sees the same shared data (`db.json` is global). After this ticket, all data in `db.json` is scoped to `userId`, and the app guards every route behind a JWT.

---

## Screens

### Screen 08 — Login
**Route:** `/auth/login`
**File:** `src/app/features/auth/pages/login/login.page.ts/.html/.scss`

**Layout (match screen 08 in design-reference.html):**
- LinguaCard logo icon (book icon, brand green, 56×56 rounded square)
- App name in Lora serif, tagline "Learn languages, your way" in hint colour
- Error pill (red, icon + message) — visible only when credentials are wrong
- Email field (focused state has brand border + soft shadow)
- Password field with "Forgot password?" link right-aligned below
- "Sign in" primary button (brand green, full width)
- "or continue with" divider
- Google Sign-In button (white card, Google logo, border)
- "Don't have an account? **Sign up**" footer link

**Behaviour:**
- Form uses Angular Reactive Forms. Validators: email format required, password min 6 chars.
- On submit: `POST /auth/login` → `{ email, password }` → receives `{ accessToken, user }`.
- Access token stored in `@capacitor/preferences` (native) or `localStorage` (PWA) under key `lc_access_token`.
- User object stored under `lc_user`.
- On 401 response: show error pill "Incorrect email or password. Please try again."
- On success: navigate to `/home`, replace browser history (so back button doesn't return to login).
- "Forgot password?" navigates to `/auth/forgot-password`.
- "Sign up" navigates to `/auth/register`.

---

### Screen 08a — Register
**Route:** `/auth/register`
**File:** `src/app/features/auth/pages/register/register.page.ts/.html/.scss`

**Fields:**
- Full name (required, min 2 chars)
- Email (required, valid email format)
- Password (required, min 8 chars, at least one number)
- Confirm password (must match password)

**Password strength indicator:**
A 4-segment bar below the password field — fills red → amber → green as password strength increases. Strength levels: Weak (< 8 chars), Fair (8+ chars, no number), Good (8+, has number), Strong (12+, has number + special char).

**Behaviour:**
- On submit: `POST /auth/register` → `{ name, email, password }` → receives `{ accessToken, user }`.
- On success: navigate to `/home` (same as login).
- Inline field errors shown on blur (not on submit): "Email already registered", "Passwords don't match".
- "Already have an account? **Sign in**" navigates to `/auth/login`.

---

### Screen 08b — Forgot Password
**Route:** `/auth/forgot-password`
**File:** `src/app/features/auth/pages/forgot-password/forgot-password.page.ts/.html/.scss`

**Layout (match screen 08b):**
- Back button (top left)
- Lock icon in brand-light circle
- Title "Forgot your password?" + explanatory text
- Email field
- Success state: green-tinted confirmation pill replaces the error area. Button text changes to "Resend email".

**Behaviour:**
- On submit: `POST /auth/forgot-password` → `{ email }`. Always shows success message regardless of whether email exists (security: don't reveal account existence).
- Success message: "Email sent! Check your inbox for a reset link. It expires in 15 minutes."
- Reset link in email navigates to `/auth/reset-password?token=...` (separate page with new password + confirm fields).
- "Back to sign in" navigates to `/auth/login`.

---

### Google Sign-In

**Native (iOS/Android):** Uses `@codetrix-studio/capacitor-google-auth` plugin. Tap → native Google sheet → returns `idToken` → `POST /auth/google` → receives `{ accessToken, user }`.

**PWA:** Uses Google OAuth2 popup via `@angular/fire` or a simple `window.open` with redirect URI. Same backend endpoint.

**json-server mock for development:**
```typescript
// MockAuthService — add:
signInWithGoogle(): Observable<{ accessToken: string; user: User }> {
  const user = { ...MOCK_USER, name: 'Google User', email: 'google@example.com' };
  return simulateDelay({ accessToken: 'mock-google-token', user }, 800);
}
```

---

## Auth Guard & Route Protection

```typescript
// src/app/core/guards/auth.guard.ts
export const AuthGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return true;
  router.navigate(['/auth/login'], { replaceUrl: true });
  return false;
};
```

All routes under the app shell (`/home`, `/vault`, `/review`, `/listen`, `/progress`) must be wrapped with `canActivate: [AuthGuard]`.

`/auth/login`, `/auth/register`, `/auth/forgot-password` must redirect to `/home` if the user IS already authenticated (`canActivate: [GuestOnlyGuard]`).

---

## HTTP Interceptor — Token attachment

```typescript
// src/app/core/interceptors/auth.interceptor.ts
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).token();
  if (!token) return next(req);
  return next(req.clone({
    setHeaders: { Authorization: `Bearer ${token}` }
  })).pipe(
    catchError(err => {
      if (err.status === 401) inject(AuthService).logout();
      return throwError(() => err);
    })
  );
};
```

---

## Data isolation — userId scoping

After authentication is in place:
- Every `GET /cards` call automatically includes `userId` via the interceptor or a query param.
- json-server: add `userId` to all mock card/collection objects and filter via `?userId=user-001`.
- NestJS (future): enforced at row level in every repository query.
- The `AuthService.user()` signal is the single source of truth for the current user ID throughout the app.

---

## Files to create / modify

| File | Action |
|---|---|
| `src/app/features/auth/pages/login/` | Create (3 files) |
| `src/app/features/auth/pages/register/` | Create (3 files) |
| `src/app/features/auth/pages/forgot-password/` | Create (3 files) |
| `src/app/features/auth/pages/reset-password/` | Create (3 files) |
| `src/app/features/auth/auth.routes.ts` | Create |
| `src/app/core/guards/auth.guard.ts` | Create |
| `src/app/core/guards/guest-only.guard.ts` | Create |
| `src/app/core/interceptors/auth.interceptor.ts` | Create |
| `src/app/core/services/auth.service.ts` | Create (replaces MockAuthService) |
| `src/app/app.routes.ts` | Add auth routes, wrap shell routes with AuthGuard |
| `db.json` | Add `userId` to all cards, collections |

## Acceptance criteria

- [ ] Unauthenticated users are redirected to `/auth/login` from any protected route
- [ ] Login with correct credentials → home screen, token stored
- [ ] Login with wrong credentials → red error pill, no navigation
- [ ] Register with all fields valid → home screen, token stored
- [ ] Register password confirmation mismatch → inline error on confirm field
- [ ] Register with existing email → inline error "Email already registered"
- [ ] Password strength bar shows 4 levels correctly
- [ ] Forgot password → success message always shown after submit
- [ ] Google Sign-In button triggers Google auth flow (mock in dev, real on native)
- [ ] All vault/home/review/listen/progress routes redirect to login when unauthenticated
- [ ] Authenticated users cannot navigate to `/auth/login` or `/auth/register`
- [ ] Sign out clears token and user, navigates to login
- [ ] After login, vault shows only the current user's cards (userId filter applied)

---

---

# LC-021 — Offline-First Local Storage & Background Sync

## Story
**As a** mobile learner,
**I want to** use LinguaCard fully when I have no internet connection,
**So that** I can review flashcards, add words, and track my progress on the train, underground, or anywhere without Wi-Fi.

## Context for Claude Code
Research summary from the Ionic and Capacitor documentation:
- <note>On iOS, IndexedDB is not guaranteed persistent — the OS can evict it when storage is low. On Android it is more stable. For truly persistent data on native, `@ionic/storage` with the CordovaSQLiteDriver is the recommended solution as it uses SQLite on native and IndexedDB as a fallback on PWA.</note>
- <note>`@capacitor/preferences` is 100% persistent but only suitable for small key/value data (auth token, user preferences, sync timestamp). It is NOT suitable for storing hundreds of cards.</note>
- The recommended architecture for this app: **`@ionic/storage` with SQLite driver on native, IndexedDB on PWA**, with a sync queue stored in `@capacitor/preferences`.

---

## Storage architecture

```
┌─────────────────────────────────────────────────┐
│                 LocalDataService                 │
│   Abstraction — same API for native and PWA     │
├─────────────────────┬───────────────────────────┤
│  Native iOS/Android │        PWA (browser)       │
│  @ionic/storage     │      @ionic/storage        │
│  + SQLite driver    │      + IndexedDB driver    │
└─────────────────────┴───────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────┐
│                  SyncService                     │
│  Queues mutations → replays when online          │
│  Uses @capacitor/preferences for queue storage  │
└─────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────┐
│               json-server / NestJS              │
│           (server of truth for data)            │
└─────────────────────────────────────────────────┘
```

---

## Installation

```bash
npm install @ionic/storage-angular
npm install cordova-sqlite-storage
npm install localforage-cordovasqlitedriver
npm install @capacitor/network
```

```typescript
// app.config.ts — add to providers:
importProvidersFrom(
  IonicStorageModule.forRoot({
    name: 'linguacard_db',
    driverOrder: [CordovaSQLiteDriver._driver, Drivers.IndexedDB, Drivers.LocalStorage]
  })
)
```

---

## LocalDataService

**File:** `src/app/core/services/local-data.service.ts`

This service wraps `@ionic/storage` and provides a typed interface for all local data operations. It is the only place in the codebase that touches local storage directly.

```typescript
@Injectable({ providedIn: 'root' })
export class LocalDataService {
  constructor(private storage: Storage) {}

  async init(): Promise<void> {
    await this.storage.defineDriver(CordovaSQLiteDriver);
    await this.storage.create();
  }

  // Cards
  async getCards(userId: string): Promise<Card[]>
  async setCards(userId: string, cards: Card[]): Promise<void>
  async upsertCard(userId: string, card: Card): Promise<void>
  async deleteCard(userId: string, cardId: string): Promise<void>

  // Collections
  async getCollections(userId: string): Promise<Collection[]>
  async setCollections(userId: string, cols: Collection[]): Promise<void>
  async upsertCollection(userId: string, col: Collection): Promise<void>

  // SRS states
  async getSrsState(cardId: string, userId: string): Promise<SRSStateData | null>
  async setSrsState(state: SRSStateData): Promise<void>

  // User preferences (thin wrapper over @capacitor/preferences)
  async getPreferences(): Promise<UserPreferences | null>
  async setPreferences(prefs: UserPreferences): Promise<void>

  // Auth token (thin wrapper over @capacitor/preferences)
  async getToken(): Promise<string | null>
  async setToken(token: string): Promise<void>
  async clearToken(): Promise<void>

  // Full wipe (used by Reset feature)
  async clearAllUserData(userId: string): Promise<void>
}
```

**Storage key convention:**
```
cards:{userId}           → Card[] (JSON serialised)
collections:{userId}     → Collection[]
srs:{userId}:{cardId}    → SRSStateData
prefs                    → UserPreferences
token                    → string
sync_queue               → SyncOperation[]
last_synced_at           → ISO timestamp string
```

---

## SyncService

**File:** `src/app/core/services/sync.service.ts`

Every write to local storage also enqueues a `SyncOperation`. When connectivity is restored, the queue is replayed against the API.

```typescript
export type SyncOperationType =
  | 'CREATE_CARD' | 'UPDATE_CARD' | 'DELETE_CARD'
  | 'RATE_CARD'
  | 'CREATE_COLLECTION' | 'UPDATE_COLLECTION' | 'DELETE_COLLECTION'
  | 'UPDATE_PREFERENCES';

export interface SyncOperation {
  id: string;               // uuid
  type: SyncOperationType;
  payload: unknown;
  createdAt: string;        // ISO timestamp
  retryCount: number;       // 0–5
  status: 'pending' | 'processing' | 'failed';
}
```

**Sync flow:**

```typescript
@Injectable({ providedIn: 'root' })
export class SyncService {
  private _status = signal<SyncStatus>('synced');
  readonly syncStatus = this._status.asReadonly();

  constructor(
    private network: Network,          // @capacitor/network
    private localData: LocalDataService,
    private cardService: CardService,  // HTTP service
    private colService: CollectionService,
  ) {
    // Listen for connectivity changes
    Network.addListener('networkStatusChange', status => {
      if (status.connected) this.processQueue();
    });
  }

  async enqueue(op: Omit<SyncOperation, 'id' | 'createdAt' | 'retryCount' | 'status'>): Promise<void>

  async processQueue(): Promise<void>
  // Reads queue from local storage
  // Processes FIFO with 50ms delay between operations
  // Exponential backoff on failure (50ms, 100ms, 200ms, 400ms, 800ms)
  // Max 5 retries then marks as 'failed'
  // On success: removes operation from queue

  async forcSync(): Promise<void>
  // Pull latest data from server, replace local store
  // Used on app launch when online
}
```

---

## Modified services — write-through pattern

Every service that writes data must follow this pattern:

```typescript
// Example: CardService.createCard()
createCard(dto: CreateCardDto): Observable<Card> {
  // 1. Create optimistic card with temp ID
  const tempCard: Card = { id: `temp_${uuid()}`, ...mapDtoToCard(dto) };

  // 2. Write to local storage immediately
  this.localData.upsertCard(this.authService.userId(), tempCard);

  // 3. Enqueue sync operation
  this.syncService.enqueue({ type: 'CREATE_CARD', payload: dto });

  // 4. Try API immediately if online
  if (navigator.onLine) {
    return this.http.post<Card>(`${this.apiUrl}`, dto).pipe(
      tap(serverCard => {
        // Replace temp card with server card (has real ID)
        this.localData.deleteCard(this.authService.userId(), tempCard.id);
        this.localData.upsertCard(this.authService.userId(), serverCard);
        // Remove from sync queue
        this.syncService.dequeue(tempCard.id);
      })
    );
  }

  // 5. Return local card immediately when offline
  return of(tempCard);
}
```

---

## App initialisation — hydration on launch

In `AppComponent.ngOnInit()`:

```typescript
async ngOnInit() {
  // 1. Initialise local storage
  await this.localData.init();

  // 2. Load token from storage → populate AuthService
  const token = await this.localData.getToken();
  if (token) this.authService.setToken(token);

  // 3. Load local data into stores (cards, collections)
  const userId = this.authService.userId();
  if (userId) {
    const cards = await this.localData.getCards(userId);
    const collections = await this.localData.getCollections(userId);
    this.cardStore.hydrate(cards);
    this.collectionStore.hydrate(collections);
  }

  // 4. If online — sync with server in background
  if (navigator.onLine) {
    this.syncService.forcSync().subscribe();
  }
}
```

---

## Sync status indicator

The sync dot in the user context menu (screen 10) reflects `SyncService.syncStatus()`:

| State | Dot colour | Label |
|---|---|---|
| `synced` | `#059669` green | Synced |
| `pending` | `#D97706` amber | N changes pending |
| `syncing` | amber, pulsing | Syncing… |
| `error` | `#B91C1C` red | Sync error |

---

## Conflict resolution

- **Card content** (front, back, article, examples): last-write-wins using `updatedAt` timestamp.
- **SRS state** (masteryLevel, nextDueAt, intervalDays): server wins — the server's SRS calculation is authoritative.
- **Collections** (name, emoji): last-write-wins.
- On a hard conflict (same `id`, `updatedAt` equal, content different): server wins and a toast shows "1 card was updated from server".

---

## Files to create / modify

| File | Action |
|---|---|
| `src/app/core/services/local-data.service.ts` | Create |
| `src/app/core/services/sync.service.ts` | Create |
| `src/app/app.config.ts` | Add IonicStorageModule |
| `src/app/app.component.ts` | Add hydration on init |
| `src/app/data/services/card.service.ts` | Modify — write-through pattern |
| `src/app/data/services/collection.service.ts` | Modify — write-through pattern |
| `src/app/data/services/review.service.ts` | Modify — offline rating support |
| `src/app/shared/components/sync-status/` | Create — dot + label component |

## Acceptance criteria

- [ ] Install `@ionic/storage-angular` + SQLite driver. `ionic serve` still runs without error.
- [ ] On app launch (online): local stores hydrated from API, then updated from API in background.
- [ ] On app launch (offline): local stores hydrated from local storage only. App renders all cards.
- [ ] Adding a word while offline: word appears in Vault immediately with a temp ID. Sync indicator shows "1 pending".
- [ ] Going back online: sync processes, temp card gets a real ID from the server. UI updates smoothly.
- [ ] Rating a flashcard while offline: SRS state updated locally. Sync on reconnect.
- [ ] Sync status dot in context menu accurately reflects the queue state.
- [ ] `forcSync()` on reconnect resolves all pending operations.
- [ ] After 5 failed retries, operation is marked `failed` and a toast shows: "Some changes couldn't sync. Tap to retry."
- [ ] All data is scoped to `userId` in local storage — user A cannot see user B's data.

---

---

# LC-022 — Vault Segment Tabs (All Words / Collections)

## Story
**As a** learner with multiple collections,
**I want to** switch between my full word list and my collections view using a clearly delineated tab control,
**So that** both views feel like first-class destinations, not an afterthought toggle.

## Context for Claude Code
Open `design-reference.html` screen **09 · Vault — segment tabs** and compare it with the screenshot provided (showing the current pill-style toggle). The problem with pills is that they look like filters, not navigation — a segment control (`IonSegment`) communicates "these are two different views" clearly and matches the Ionic design system's convention.

Looking at the screenshot: the current pills "All words" (filled green) and "Collections" (outline) are ambiguous — they feel like they belong with the category filter chips below them, not as a primary navigation control.

---

## Change: Replace pills with IonSegment

**File:** `src/app/features/vault/pages/vault/vault.page.html`

**Remove:**
```html
<!-- Current — two pill buttons -->
<div style="padding: 0 14px 12px; display:flex; gap:8px;">
  <button class="pill-active">All words</button>
  <button class="pill-inactive">Collections</button>
</div>
```

**Replace with:**
```html
<!-- New — IonSegment -->
<ion-segment [(ngModel)]="activeTab" (ionChange)="onTabChange($event)" mode="ios"
  style="margin: 0 14px 12px; --background: rgba(45,90,78,0.08); border-radius: 10px;">
  <ion-segment-button value="words" style="--border-radius: 8px;">
    <ion-label>All words</ion-label>
  </ion-segment-button>
  <ion-segment-button value="collections" style="--border-radius: 8px;">
    <ion-label>Collections</ion-label>
  </ion-segment-button>
</ion-segment>
```

**Design spec (match screen 09):**
- Segment container: `background: rgba(45,90,78,0.08)` (subtle green tint), `border-radius: 10px`, `padding: 3px`, `margin: 0 14px 12px`.
- Active tab pill: `background: var(--lc-card)`, `color: var(--lc-brand)`, `font-weight: 600`, subtle box shadow `0 1px 4px rgba(0,0,0,0.08)`.
- Inactive tab: `color: var(--lc-text-hint)`, no background.
- Font: `DM Sans`, `12px`, `font-weight: 600`.
- iOS segment mode (`mode="ios"`) for the sliding indicator effect.

**CSS overrides in `vault.page.scss`:**
```scss
ion-segment {
  --background: rgba(45, 90, 78, 0.08);
  border-radius: 10px;
  padding: 3px;
}

ion-segment-button {
  --border-radius: 8px;
  --color: var(--lc-text-hint);
  --color-checked: var(--lc-brand);
  --background-checked: var(--lc-card);
  --indicator-color: transparent;
  font-family: var(--lc-font-body);
  font-size: 12px;
  font-weight: 600;
  min-height: 34px;
  text-transform: none;
  --box-shadow-checked: 0 1px 4px rgba(0,0,0,0.08);
}
```

---

## Component logic

```typescript
// vault.page.ts
activeTab = signal<'words' | 'collections'>('words');

onTabChange(event: CustomEvent) {
  this.activeTab.set(event.detail.value);
}
```

In the template, use `@if` to show/hide content:
```html
@if (activeTab() === 'words') {
  <!-- Search bar + category chips + article legend + word list -->
}
@if (activeTab() === 'collections') {
  <!-- Collections list (same as screen 07) rendered inline -->
}
```

The Collections view rendered under the "Collections" tab is the same component as screen 07, mounted inline — no separate route navigation needed. The Collections tab is not a new page; it's a view switch within the Vault page.

**URL sync (optional but clean):**
```typescript
// Persist tab selection in URL query param so back/forward works
// /vault → default "words" tab
// /vault?tab=collections → collections tab
```

---

## Upload button position
Looking at the screenshot, the upload (import CSV) icon button and the + FAB are both in the top-right. In screen 09, the upload button uses `p-back` circle style with a brand tint and an upload arrow icon. This is cleaner than having two different-sized buttons.

Both buttons remain in the header, no change to their position.

---

## Files to modify

| File | Change |
|---|---|
| `src/app/features/vault/pages/vault/vault.page.html` | Replace pills with `ion-segment` |
| `src/app/features/vault/pages/vault/vault.page.ts` | Add `activeTab` signal, `onTabChange()` |
| `src/app/features/vault/pages/vault/vault.page.scss` | Add segment CSS overrides |

## Acceptance criteria

- [ ] Vault page renders `IonSegment` with "All words" and "Collections" tabs as per screen 09
- [ ] "All words" is active by default (green text, white background pill, subtle shadow)
- [ ] Tapping "Collections" switches to collections view without page navigation
- [ ] Tapping "All words" switches back to word list
- [ ] The sliding animation between tabs is smooth (iOS segment mode)
- [ ] Active tab state persists if user navigates away and back (stored in component signal)
- [ ] Category filter chips and search bar are only visible when "All words" is active
- [ ] Collections view shows the same content as screen 07 (collection cards with progress bars)
- [ ] The old pill buttons are completely removed

---

---

# LC-023 — User Context Menu, Theme Toggle & Reset All Data

## Story
**As a** user who wants to personalise the app or manage my account,
**I want to** access a context menu from my avatar in the app header,
**So that** I can toggle dark/light mode, check my sync status, and reset my data — all without navigating to a separate settings screen.

## Context for Claude Code
Open `design-reference.html` screens **10 · User context menu** and **10a · Reset data — confirm**. The context menu pops out from the avatar button in the top-right of the home screen header. It is a floating card (not a modal, not a bottom sheet) that closes when tapping outside.

Currently the app has a theme toggle button **next to** the avatar in the nav bar. This ticket moves that toggle **into** the context menu and removes the standalone button.

---

## Part A — Context Menu

### Entry point

In the app header (`AppShellComponent` or `HomePageComponent`), the avatar circle (currently shows initials like "JS") becomes a tappable button:

```html
<!-- In app header — replace static div with button -->
<button class="avatar-btn" (click)="toggleMenu($event)" [attr.aria-expanded]="menuOpen()">
  <span class="avatar-initials">{{ userInitials() }}</span>
</button>

<!-- Context menu (conditionally rendered) -->
@if (menuOpen()) {
  <div class="ctx-backdrop" (click)="closeMenu()"></div>
  <div class="ctx-menu" role="menu">
    <!-- content -->
  </div>
}
```

### Menu layout (match screen 10 exactly)

```
┌──────────────────────────────┐
│  Jan Schmidt                 │
│  jan@example.com             │
├──────────────────────────────┤
│  🌙 Dark mode        [toggle]│
├──────────────────────────────┤
│  ↻  Sync status     ● Synced │
├──────────────────────────────┤
│  🗑  Reset all data      >   │  ← red text
├──────────────────────────────┤
│  →  Sign out                 │
└──────────────────────────────┘
```

### Menu items

**Dark mode row:**
- Left: moon icon + "Dark mode" label
- Right: an `IonToggle` bound to `ThemeService.isDark()`
- Toggling switches `document.body` class `dark` on/off and persists to `LocalDataService.setPreferences()`
- CSS: `--track-background: var(--lc-border); --track-background-checked: var(--lc-brand)`

**Sync status row:**
- Left: sync arrows icon + "Sync status" label
- Right: coloured dot + text from `SyncService.syncStatus()`
- `synced` → green dot + "Synced"
- `pending` → amber dot + "N pending"
- `syncing` → pulsing amber dot + "Syncing…"
- `error` → red dot + "Sync error — tap to retry" (tapping row calls `syncService.forcSync()`)
- This row is read-only (not interactive) except in error state

**Reset all data row:**
- Text is `#B91C1C` red (`.ctx-item-danger`)
- Tapping opens the Reset Confirmation sheet (screen 10a)
- Menu closes when sheet opens

**Sign out row:**
- Tapping calls `AuthService.logout()` → clears token and user from storage → navigates to `/auth/login`

### Positioning and animation

- Menu appears at `top: 46px; right: 14px` relative to the header
- Enter: `opacity 0 → 1`, `scale(0.95) → scale(1)`, duration 150ms, `ease-out`
- Exit: same in reverse, duration 100ms
- Backdrop: transparent (tapping anywhere outside closes the menu, no dim)
- On mobile: menu is full-width (`left: 14px; right: 14px`) if viewport < 360px

---

## Part B — Remove standalone theme toggle button

The current design has a standalone button (sun/moon icon) beside the avatar in the nav bar. This button is **removed** in this ticket. The only way to toggle theme is now via the context menu toggle.

Files to update:
- `src/app/features/home/pages/home/home.page.html` — remove the standalone toggle button
- `src/app/core/services/theme.service.ts` — no change to service, only the UI entry point moves

---

## Part C — Reset All Data (Extensive)

This is a **destructive, irreversible action** that permanently deletes all user-generated content. It must be treated with the same gravity as account deletion.

### What "Reset all data" deletes

| Data | Deleted? |
|---|---|
| All vocabulary cards | ✅ Yes |
| All collections | ✅ Yes |
| All SRS states (mastery, intervals, ratings) | ✅ Yes |
| All review session history | ✅ Yes |
| Progress stats and streak data | ✅ Yes |
| Synced server-side data | ✅ Yes (DELETE requests sent to API) |
| Local storage for this user | ✅ Yes |
| Account (email, password) | ❌ No — account remains |
| Auth token | ❌ No — user stays logged in |

### Reset confirmation flow (screen 10a)

**File:** `src/app/features/auth/components/reset-data-sheet/reset-data-sheet.component.ts/.html/.scss`

**Layout (match screen 10a exactly):**
1. Drag handle
2. Red trash icon in a red-tinted circle
3. Title: "Reset all data?"
4. Body text: "This will permanently delete all your words, collections, review history, and progress. Your account will remain active."
5. Red warning box with dynamic counts: "⚠️ **This action cannot be undone.** All 405 words, 3 collections, and 47 review sessions will be deleted permanently."
6. Password confirmation field labelled "Enter your password to confirm" — this is the security gate
7. Red "Yes, delete everything" button — **disabled** until password field is non-empty
8. "Cancel" text link

**On "Yes, delete everything" tap:**

```typescript
async confirmReset(password: string): Promise<void> {
  // 1. Show loading spinner in the button
  this.loading.set(true);

  // 2. Verify password against server
  // POST /auth/verify-password → { email: user.email, password }
  // → 200 OK or 401 Unauthorized
  const valid = await this.authService.verifyPassword(password);

  if (!valid) {
    this.loading.set(false);
    this.passwordError.set('Incorrect password. Please try again.');
    return;
  }

  // 3. Delete all server data
  await this.cardService.deleteAll().toPromise();      // DELETE /cards?userId=...
  await this.collectionService.deleteAll().toPromise(); // DELETE /collections?userId=...
  await this.reviewService.deleteAll().toPromise();     // DELETE /reviewSessions?userId=...
  await this.progressService.reset().toPromise();       // DELETE /progressStats?userId=...

  // 4. Clear local storage for this user
  await this.localData.clearAllUserData(this.authService.userId());

  // 5. Reset all in-memory stores
  this.cardStore.reset();
  this.collectionStore.reset();
  this.progressStore.reset();

  // 5. Close sheet, show success toast
  this.modalCtrl.dismiss();
  this.toastCtrl.create({
    message: '✓ All data has been reset. Start fresh!',
    duration: 3000,
    color: 'success',
    position: 'top'
  }).then(t => t.present());
}
```

**json-server mock for DELETE all:**
```typescript
// CardService — add:
deleteAll(): Observable<void> {
  // In development: loop through all user cards and DELETE each
  return this.getAll().pipe(
    switchMap(cards =>
      forkJoin(cards.map(c => this.http.delete(`${this.apiUrl}/${c.id}`)))
    ),
    map(() => undefined)
  );
}
```

---

## Files to create / modify

| File | Action |
|---|---|
| `src/app/shared/components/user-menu/user-menu.component.ts/.html/.scss` | Create context menu component |
| `src/app/features/auth/components/reset-data-sheet/reset-data-sheet.component.ts/.html/.scss` | Create reset sheet |
| `src/app/features/home/pages/home/home.page.html` | Add avatar button, remove standalone theme toggle |
| `src/app/features/home/pages/home/home.page.ts` | Add `menuOpen()`, `toggleMenu()`, `closeMenu()` |
| `src/app/core/services/theme.service.ts` | Ensure `isDark()` signal is exported |
| `src/app/data/services/card.service.ts` | Add `deleteAll()` |
| `src/app/data/services/collection.service.ts` | Add `deleteAll()` |
| `src/app/data/services/review.service.ts` | Add `deleteAll()` |

---

## Acceptance criteria — Context menu

- [ ] Avatar button in home screen header opens context menu on tap (match screen 10)
- [ ] Menu shows: user full name, email, dark mode toggle, sync status, reset all data (red), sign out
- [ ] Tapping anywhere outside the menu closes it (backdrop click)
- [ ] Menu opens and closes with `opacity` + `scale` animation (150ms open, 100ms close)
- [ ] Dark mode `IonToggle` reflects current theme state on open
- [ ] Toggling dark mode immediately switches theme on entire app
- [ ] Dark mode preference persists across app restarts (stored in local preferences)
- [ ] Sync status row shows correct state colour + text from `SyncService`
- [ ] In error state, tapping sync row calls `forcSync()`
- [ ] Standalone theme toggle button is removed from the nav bar
- [ ] Sign out clears token, navigates to `/auth/login`, clears in-memory stores

## Acceptance criteria — Reset all data

- [ ] "Reset all data" menu item opens the confirmation sheet (match screen 10a)
- [ ] Warning box displays **actual current counts**: words, collections, review sessions
- [ ] "Yes, delete everything" button is **disabled** until password field is non-empty
- [ ] Wrong password: error shown under password field, button re-enabled
- [ ] Correct password: loading spinner in button during deletion
- [ ] After reset: Vault shows empty state, Home shows 0 words, streak resets to 0
- [ ] Success toast shown: "✓ All data has been reset. Start fresh!"
- [ ] User remains logged in after reset (token not cleared)
- [ ] Cancelling the sheet: no data is modified
- [ ] After reset, local storage for the user is cleared (`clearAllUserData()`)
- [ ] After reset, all in-memory signal stores are reset to empty arrays
