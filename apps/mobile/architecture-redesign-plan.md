Feature-First Architecture Proposal — LinguaCard Mobile
1. What's Wrong Today
Problem	Current State	Impact
Centralized API services	card-api.service.ts, story-api.service.ts all in core/services/	Any feature change touches core; no clear ownership
Mixed store styles	ngrx/signals in some features, raw Injectable services in others	Inconsistent mental model, harder to onboard
local-data.service.ts owns everything	One service knows cards, collections, sync timestamps	Single point of failure; untestable in isolation
sync.service.ts knows operation types	CREATE_CARD, DELETE_COLLECTION, etc. hardcoded in core	Adding a new syncable resource requires touching core
Audio lives in core as utility	audio.service.ts in core/services/, UI in shared/components/	Listen feature has no real home; audio-player is an orphan
CSV import is a service, not a feature	csv-import.service.ts in core	Used by vault, but vault doesn't own it; no UI shell
Models all in mock-data.ts	One file for Card, Collection, Category, Story	Circular imports, no clear feature boundary on types
2. Architecture Tradeoff Analysis
Before recommending a structure, here are the three approaches and their tradeoffs for this specific app:

Layered Architecture

services/ → stores/ → components/
Pros: Simple to understand, familiar to Angular developers.
Cons: Features are spread across every layer. Adding a story feature means touching services/, stores/, components/, routes/. Doesn't scale past 3-4 features. Cross-feature coupling is invisible.

Domain-Driven Modularization (DDD)
Bounded contexts like SRS, Content, User, Sync as top-level modules.
Pros: Reflects the real business model. Sync, SRS, and Content are genuinely separate domains.
Cons: Overkill at this scale. Angular/Ionic apps don't map naturally to DDD contexts — you end up with very abstract module names that don't match what developers think about ("I'm working on the Listen feature," not "I'm working on the AudioContentDomain").

Feature-First Architecture ✓ Recommended

features/listen/ → owns everything the listen feature needs
Pros: File ownership matches the way your team thinks. A new developer can understand the entire listen feature by reading one folder. Features are independently deployable/testable. Refactoring one feature doesn't cascade.
Cons: Some genuine cross-cutting concerns (sync, offline storage, SRS algorithm) need deliberate placement — this is handled by the core/ and shared/ layers described below.

Recommendation: Feature-first architecture with a strict three-layer rule: core → shared → features. Features never reach into other features.

3. Proposed Folder Structure

apps/mobile/src/app/
│
├── core/                          ← Infrastructure only — no feature logic
│   ├── auth/
│   │   ├── auth.service.ts        ← Token management, session signals
│   │   ├── auth.guard.ts
│   │   └── auth.interceptor.ts
│   ├── sync/
│   │   ├── sync.service.ts        ← Queue orchestration only
│   │   ├── sync-queue.store.ts    ← Persisted queue state (ngrx/signals)
│   │   └── sync-operation.model.ts ← Generic SyncOperation<T> type
│   ├── storage/
│   │   └── local-storage.service.ts ← Raw get/set/clear — no domain knowledge
│   ├── network/
│   │   └── network.service.ts     ← Online/offline signal only
│   ├── pwa/
│   │   └── pwa-install.service.ts
│   ├── theme/
│   │   └── theme.service.ts
│   └── core.providers.ts          ← provideCore() — registers all core deps
│
├── shared/                        ← Reusable UI and logic — no feature state
│   ├── components/
│   │   ├── article-badge/
│   │   ├── mastery-dot/
│   │   ├── sync-status/
│   │   ├── fab-button/
│   │   └── user-menu/
│   ├── audio/                     ← Audio as shared platform capability
│   │   ├── audio.service.ts       ← TTS engine, playback primitives
│   │   ├── audio-player/          ← <lc-audio-player> component
│   │   └── audio.model.ts         ← AudioConfig, PlaybackState types
│   ├── csv/                       ← Reusable import capability
│   │   ├── csv-parser.service.ts  ← Pure parsing logic (no HTTP, no store)
│   │   ├── csv-import-ui/         ← Reusable import sheet component
│   │   └── csv.model.ts           ← ParsedRow, ImportResult types
│   ├── srs/                       ← SM-2 algorithm as a shared utility
│   │   ├── sm2.service.ts         ← Pure function: rateCard() → SRSUpdate
│   │   └── srs.model.ts           ← SRSStateData, MasteryLevel types
│   ├── pipes/
│   │   ├── article-class.pipe.ts
│   │   └── mastery-label.pipe.ts
│   ├── helpers/
│   │   └── helpers.ts
│   └── shared.providers.ts
│
└── features/                      ← Product features — each self-contained
    │
    ├── auth/
    │   ├── pages/
    │   │   ├── login/
    │   │   ├── register/
    │   │   └── forgot-password/
    │   ├── components/
    │   │   └── reset-data-sheet/
    │   └── auth.routes.ts
    │
    ├── onboarding/
    │   ├── pages/
    │   │   └── onboarding/
    │   └── onboarding.routes.ts
    │
    ├── home/
    │   ├── pages/
    │   │   └── home/
    │   └── home.routes.ts
    │
    ├── vault/                     ← Card and collection management
    │   ├── pages/
    │   │   ├── vault/
    │   │   ├── word-detail/
    │   │   ├── collections/
    │   │   └── collection-detail/
    │   ├── components/
    │   │   ├── add-word-sheet/
    │   │   ├── assign-collection-sheet/
    │   │   └── category-selector/
    │   ├── import/                ← Import sub-feature (owns CSV UI flow)
    │   │   ├── pages/
    │   │   │   ├── import/        ← Uses shared/csv/csv-import-ui
    │   │   │   └── import-review/
    │   │   └── import-state.service.ts ← Wizard step state
    │   ├── store/
    │   │   ├── card.store.ts      ← Moved here from core
    │   │   ├── category.store.ts  ← Moved here from core
    │   │   └── collection.store.ts
    │   ├── services/
    │   │   ├── card-api.service.ts     ← Moved here from core
    │   │   ├── category-api.service.ts
    │   │   └── collection-api.service.ts
    │   ├── models/
    │   │   ├── card.model.ts
    │   │   ├── collection.model.ts
    │   │   └── category.model.ts
    │   └── vault.routes.ts
    │
    ├── review/                    ← Study session
    │   ├── pages/
    │   │   ├── review-hub/
    │   │   ├── review/            ← Card player
    │   │   ├── session-summary/
    │   │   ├── custom-study/
    │   │   ├── mastery-breakdown/
    │   │   ├── session-history/
    │   │   └── struggling-cards/
    │   ├── store/
    │   │   └── review.store.ts
    │   ├── services/
    │   │   └── review-filter.service.ts
    │   ├── models/
    │   │   └── review.model.ts    ← ReviewSession, RatingEvent types
    │   └── review.routes.ts
    │
    ├── listen/                    ← Audio playlist feature
    │   ├── pages/
    │   │   └── listen/
    │   ├── components/
    │   │   └── playlist-source-sheet/
    │   ├── store/
    │   │   └── listen.store.ts    ← Owns queue, playback mode, shuffle
    │   ├── models/
    │   │   └── listen.model.ts    ← PlaybackMode, PlaylistSource types
    │   └── listen.routes.ts
    │
    ├── stories/
    │   ├── pages/
    │   │   ├── story-library/
    │   │   ├── story-reader/
    │   │   └── story-complete/
    │   ├── components/
    │   │   └── generate-story-sheet/
    │   ├── store/
    │   │   └── story.store.ts
    │   ├── services/
    │   │   └── story-api.service.ts  ← Moved here from core
    │   ├── models/
    │   │   └── story.model.ts
    │   └── stories.routes.ts
    │
    └── progress/
        ├── pages/
        │   └── progress/
        └── progress.routes.ts
4. Dependency Direction Rules

features  →  shared  →  core  →  (external: Ionic, Capacitor, Angular)
Hard rules:

Features never import from other features. listen/ cannot import from vault/. If they share data, it flows through a shared service or the shared store.
Core never imports from features or shared. Core is infrastructure — it has no knowledge of Card, Story, or Collection.
Shared never imports from features. The CSV parser doesn't know about vault/import/. The audio service doesn't know about listen/.
Features own their stores. card.store.ts belongs in vault/ — it is vault's state. The home page reads from it by injecting CardStore, not by reaching into vault's folder.
Shared stores are forbidden. There is no GlobalAppState. Features read each other's stores by injecting them (Angular DI), not by importing files across feature boundaries.
5. What Belongs in Core
Core is pure infrastructure. The test: "Would this exist in a completely different app that has nothing to do with flashcards?" If yes → core.

Stays in Core	Reason
AuthService	Token lifecycle, session signals — not flashcard-specific
AuthGuard, AuthInterceptor	HTTP/routing infrastructure
SyncService	Queue orchestration, retry logic — generic
LocalStorageService	Raw key/value persistence — no domain knowledge
NetworkService	Online/offline signal
PwaInstallService	Platform-level install prompt
ThemeService	UI theme toggle
Moves Out of Core	Where It Goes
CardApiService	features/vault/services/
CollectionApiService	features/vault/services/
StoryApiService	features/stories/services/
CardStore, CategoryStore	features/vault/store/
CsvImportService (parsing logic)	shared/csv/
AudioService	shared/audio/
The sync operation model is the tricky part. Today sync.service.ts knows about CREATE_CARD, DELETE_COLLECTION, etc. This couples core to features. Fix: make SyncOperation<T> generic in core, and let each feature register its own handler.


// core/sync/sync-operation.model.ts
export interface SyncOperation<T = unknown> {
  id: string;
  type: string;       // e.g. 'CREATE_CARD' — core doesn't know what this means
  payload: T;
  retries: number;
  createdAt: string;
}

export interface SyncHandler {
  type: string;
  execute(operation: SyncOperation): Observable<void>;
}

// core/sync/sync.service.ts
export class SyncService {
  private handlers = new Map<string, SyncHandler>();

  register(handler: SyncHandler): void {
    this.handlers.set(handler.type, handler);
  }

  // SyncService calls handler.execute() — it never knows about Card
}

// features/vault/services/card-sync.handler.ts
export class CardSyncHandler implements SyncHandler {
  type = 'CREATE_CARD';
  execute(op: SyncOperation<CreateCardDto>): Observable<void> { ... }
}
Each feature registers its own sync handlers in its providers. Core remains decoupled.

6. Audio: Shared Platform Capability + Standalone Feature
Audio has two roles that must be cleanly separated:

Role 1 — Shared Platform Capability (shared/audio/)
This is the TTS engine. It knows nothing about cards or playlists.


// shared/audio/audio.service.ts
export class AudioService {
  speak(text: string, config?: AudioConfig): Observable<void>
  stop(): void
  readonly isPlaying: Signal<boolean>
  readonly isSpeaking: Signal<boolean>
}
Used by: listen/, review/, vault/ (word-detail playback), shared/components/audio-player/.

Role 2 — Listen Feature (features/listen/)
This is the playlist domain. It owns queue management, playback modes, shuffle, and the SM-2 rating triggered by listening.


// features/listen/store/listen.store.ts
// Injects AudioService from shared — never re-implements TTS
// Owns: queue, currentIndex, playbackMode, isShuffled
// Builds utterance sequences from card data
// Calls sm2.service.ts from shared/srs/ for rating updates
Key rule: ListenStore uses AudioService but does not extend it. The <lc-audio-player> component in shared/audio/ is a dumb playback button — it doesn't know about playlists or cards. The listen page owns the playlist UI.

7. CSV Import: Reusable Shared Feature
CSV import is used in at least one place today (vault import) and likely future places (deck import, community decks). Structure it as a self-contained capability in shared:


shared/csv/
├── csv-parser.service.ts      ← Pure function: string → ParsedRow[]
├── csv-field-mapper.service.ts ← Maps columns → Card fields (configurable)
├── csv-import-ui/             ← Reusable bottom sheet: file picker + preview table
│   ├── csv-import-ui.component.ts
│   └── csv-import-ui.component.html
└── csv.model.ts               ← ParsedRow, ColumnMapping, ImportConfig
The vault import pages wrap this component and add vault-specific logic (which collection to assign, category selection). The shared component knows nothing about vault.


// shared/csv/csv-import-ui.component.ts
@Output() imported = new EventEmitter<ParsedRow[]>();
// Emits raw parsed rows — caller decides what to do with them

// features/vault/import/pages/import/import.page.ts
// Listens to (imported), maps ParsedRow[] → CreateCardDto[], calls CardStore
8. State Management Boundaries
Standardize on ngrx/signals (signalStore)
Today you have three patterns: signalStore() (ngrx), raw Injectable with signal(), and nothing. Pick one. ngrx/signals signalStore is already used in CardStore, StoryStore, and CollectionStore — standardize everything on it.

Rule: one store per aggregate root, owned by the feature that owns the aggregate.

Store	Owner	Injected By
CardStore	vault/	vault/, review/, listen/, home/
CategoryStore	vault/	vault/, home/
CollectionStore	vault/	vault/, review/
ReviewStore	review/	review/ only
ListenStore	listen/	listen/ only
StoryStore	stories/	stories/ only
Cross-feature data sharing happens through injection, not import. The review hub page injects CardStore from Angular DI — it doesn't import from vault/store/. The stores are providedIn: 'root' singletons.

Avoid These State Anti-Patterns
Global god store — AppState that holds everything. Features can't be independently loaded or tested.
Duplicate state — Don't copy cards into ListenStore.queue as Card[] and also have them in CardStore. ListenStore holds card IDs; it reads card data through CardStore.
Store-to-store calls — ListenStore should not inject ReviewStore. If both need SRS updates after rating, extract SRS updating into shared/srs/sm2.service.ts and have both call it directly.
9. Migration Strategy
Do this incrementally — don't rewrite everything at once.

Phase 1 — Create the scaffolding (1-2 days, no behavior changes)
Create shared/audio/, shared/csv/, shared/srs/ folders with placeholder files
Create features/vault/services/, features/vault/models/, features/stories/services/
Move srs.model.ts types out of mock-data.ts into shared/srs/srs.model.ts
Move Card, Collection, Category types to features/vault/models/
Move Story type to features/stories/models/
Update barrel exports — everything still works, only paths changed
Phase 2 — Move services into feature ownership (2-3 days)
Move card-api.service.ts → features/vault/services/ (update imports)
Move category-api.service.ts → features/vault/services/
Move collection-api.service.ts → features/vault/services/
Move story-api.service.ts → features/stories/services/
Move AudioService → shared/audio/
Extract CsvParser pure logic → shared/csv/csv-parser.service.ts
Phase 3 — Move stores into feature ownership (2-3 days)
Move CardStore → features/vault/store/
Move CategoryStore → features/vault/store/
Convert ReviewStore from raw Injectable → signalStore()
Convert ListenStore from raw Injectable → signalStore()
Update ListenStore to hold card IDs and read from CardStore instead of copying card data
Phase 4 — Decouple sync from feature types (1-2 days)
Extract SyncOperation<T> generic type into core/sync/sync-operation.model.ts
Create SyncHandler interface
Move CREATE_CARD, UPDATE_CARD, etc. handling → features/vault/services/card-sync.handler.ts
Register handlers via provideVault() in vault's providers
SyncService no longer imports any feature type
Phase 5 — Vault import sub-feature (1 day)
Create features/vault/import/ with its own route subtree
Move import/ and import-review/ pages there
Wrap shared/csv/csv-import-ui/ in vault's import page
10. Common Anti-Patterns to Avoid
Anti-Pattern	Why It Hurts	Better Approach
Feature reaching into another feature's folder	stories/ imports from vault/models/	Lift the type to shared/ or inject the store
Core knowing about domain types	SyncService imports CreateCardDto	Generic SyncOperation<T>, feature registers handler
Fat shared module	Everything goes into shared/ because it's "not specific enough"	If only one feature uses it, it belongs in that feature
Circular store dependencies	ListenStore injects ReviewStore injects CardStore injects...	Extract shared logic into shared/srs/sm2.service.ts
Copying state across stores	ListenStore.queue: Card[] mirrors CardStore.cards	Store IDs, read from source store
Page components with business logic	ReviewPage directly calling SM-2 algorithm	ReviewStore owns business logic; page only calls store methods
Global route imports	All feature routes imported in app.routes.ts eagerly	All features use loadChildren / loadComponent for lazy loading
Inconsistent store patterns	Some features use signalStore, some use raw Injectable	Pick signalStore everywhere, even for simple state
11. Dependency Boundary Examples
Good: Home page reading vault data

// features/home/pages/home/home.page.ts
import { CardStore } from 'features/vault/store/card.store';  // ✓ inject via DI
// home page reads recentCards, dueCards from CardStore signal
// No import from vault's components, models, or services
Good: Review using shared SM-2

// features/review/store/review.store.ts
import { Sm2Service } from 'shared/srs/sm2.service';   // ✓ shared utility
import { CardStore } from 'features/vault/store/card.store'; // ✓ inject store
// ReviewStore calls sm2.service.rateCard() — doesn't re-implement algorithm
Good: Listen using audio without owning it

// features/listen/store/listen.store.ts
import { AudioService } from 'shared/audio/audio.service';  // ✓ shared platform
// ListenStore builds utterances, AudioService speaks them
// ListenStore doesn't know about SpeechSynthesis API
Bad: Feature importing feature

// features/stories/store/story.store.ts
import { CardStore } from 'features/vault/store/card.store';
// ✗ If stories need card data, that's a signal that stories needs
//   its own read model OR that the feature boundary is wrong
Bad: Core knowing about domain

// core/sync/sync.service.ts
import { CreateCardDto } from 'features/vault/models/card.model';  // ✗ 
// Core should handle SyncOperation<unknown>, not know about Card DTOs
12. Long-Term Maintainability
Team scaling: When a second developer joins and takes ownership of the stories feature, they should be able to read features/stories/ and understand the entire feature. They should never need to touch core/ to add a new story type.

Testing: Each feature becomes independently testable. ReviewStore can be tested with a mocked CardStore and mocked Sm2Service — no need to set up the entire app.

Adding a new feature: Adding comprehension/ (cloze fill-the-gap) means:

Create features/comprehension/
Add route to app.routes.ts (one line)
Register sync handler if needed
Done — nothing else in the codebase changes
Removing a feature: Delete features/stories/. Remove its route. If SyncService used a generic handler pattern, nothing in core breaks. No other feature imported from stories, so nothing else breaks.

Quick Reference: Decision Tree for New Code

Is this infrastructure that any app would need (auth, HTTP, storage, network)?
  → core/

Is this a UI component, pipe, or algorithm used by 2+ features?
  → shared/

Is this TTS/audio platform capability?
  → shared/audio/

Is this CSV parsing logic?
  → shared/csv/

Is this SM-2 / SRS algorithm?
  → shared/srs/

Is this owned by exactly one feature?
  → features/<feature-name>/

Is this a store?
  → features/<feature-name>/store/ (ngrx signalStore, providedIn root)

Is this an HTTP service talking to one resource?
  → features/<feature-name>/services/