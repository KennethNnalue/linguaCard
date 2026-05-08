# LinguaCard — Project Context for Claude

## What this is
A hybrid language learning app built with Angular 21 + Ionic 8 + Capacitor 6.
Targets: iOS, Android, and Progressive Web App (PWA) from one codebase.
Backend: NestJS (not built yet). Currently running **json-server** as the local REST API.
Primary use case: German vocabulary learning. Architecture is extensible to any language or study domain.

---

## Current development setup

### API layer
- **json-server** runs at `http://localhost:3000`
- All mock data lives in `db.json` at the project root
- Services talk to json-server exactly as they will talk to the real NestJS backend
- When the real backend is ready, only `environment.apiUrl` changes — nothing else

### Environment files
```
src/environments/
├── environment.ts           ← development (json-server)
└── environment.production.ts ← production (real NestJS URL)
```

```typescript
// environment.ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000'
};

// environment.production.ts
export const environment = {
  production: true,
  apiUrl: 'https://api.linguacard.app'
};
```

### Starting the dev environment
```bash
# Terminal 1 — json-server (mock backend)
npx json-server --watch db.json --port 3000

# Terminal 2 — Ionic app
ionic serve
```

---

## Library / code splitting structure

The codebase is split into small, focused libraries so each piece is easy to find, test, and replace. Every library has a single responsibility.

```
src/
├── app/
│   ├── core/                          ← Singleton services, guards, interceptors
│   │   ├── interceptors/
│   │   │   ├── auth.interceptor.ts    ← Attaches Bearer JWT to every request
│   │   │   └── error.interceptor.ts   ← Global HTTP error handling
│   │   ├── guards/
│   │   │   └── auth.guard.ts
│   │   └── core.providers.ts          ← provideCore() — registers all core deps
│   │
│   ├── data/                          ← All API communication (one file per resource)
│   │   ├── models/                    ← TypeScript interfaces & enums (source of truth)
│   │   │   ├── card.model.ts
│   │   │   ├── category.model.ts
│   │   │   ├── deck.model.ts
│   │   │   ├── user.model.ts
│   │   │   ├── review.model.ts
│   │   │   ├── srs.model.ts
│   │   │   ├── progress.model.ts
│   │   │   ├── audio.model.ts
│   │   │   └── index.ts               ← barrel export for all models
│   │   ├── services/                  ← HTTP services (one per resource)
│   │   │   ├── card.service.ts
│   │   │   ├── category.service.ts
│   │   │   ├── deck.service.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── user.service.ts
│   │   │   ├── review.service.ts
│   │   │   ├── srs.service.ts
│   │   │   ├── progress.service.ts
│   │   │   └── audio.service.ts
│   │   └── data.providers.ts          ← provideData() — registers HttpClient etc.
│   │
│   ├── shared/                        ← Reusable UI components, pipes, directives
│   │   ├── components/
│   │   │   ├── article-badge/         ← <lc-article-badge [article]="'der'">
│   │   │   ├── mastery-dot/           ← <lc-mastery-dot [level]="3">
│   │   │   ├── audio-player/          ← <lc-audio-player [text]="word" lang="de">
│   │   │   ├── word-item/             ← <lc-word-item [card]="card">
│   │   │   ├── skeleton-list/         ← loading skeleton rows
│   │   │   └── sync-status/           ← synced / pending / error dot
│   │   ├── pipes/
│   │   │   ├── article-class.pipe.ts  ← maps 'der' → 'lc-article-badge--der'
│   │   │   └── mastery-label.pipe.ts  ← maps 0 → 'New', 5 → 'Mastered'
│   │   └── shared.providers.ts
│   │
│   └── features/                      ← One folder per Epic, lazy-loaded
│       ├── auth/                      ← Login, Register pages
│       ├── home/                      ← Dashboard (Epic 1)
│       ├── vault/                     ← Word list, Add/Edit word (Epic 1)
│       ├── review/                    ← Flashcard session (Epic 1)
│       ├── listen/                    ← Audio playlist (Epic 2)
│       ├── comprehension/             ← Cloze fill-the-gap (Epic 3)
│       └── progress/                  ← Stats dashboard (Epic 5)
│
├── environments/
│   ├── environment.ts
│   └── environment.production.ts
│
└── db.json                            ← json-server data (root of project)
```

---

## Service pattern — follow this for every service

Every HTTP service follows the same shape. This makes swapping json-server → NestJS zero-effort.

```typescript
@Injectable({ providedIn: 'root' })
export class CardService {
  private apiUrl = `${environment.apiUrl}/cards`;

  constructor(private http: HttpClient) {}

  getAll(params?: CardQueryParams): Observable<Card[]> {
    return this.http.get<Card[]>(this.apiUrl, { params: { ...params } });
  }

  getById(id: string): Observable<Card> {
    return this.http.get<Card>(`${this.apiUrl}/${id}`);
  }

  create(dto: CreateCardDto): Observable<Card> {
    return this.http.post<Card>(this.apiUrl, dto);
  }

  update(id: string, dto: UpdateCardDto): Observable<Card> {
    return this.http.patch<Card>(`${this.apiUrl}/${id}`, dto);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
```

**Rules:**
- Always use typed generics: `http.get<Card[]>()` — never `http.get<any>()`
- Always return `Observable<T>` — never subscribe inside a service
- Use `CreateCardDto` / `UpdateCardDto` types for write operations — never pass raw `Card`
- Query params typed as an interface, never `any`

---

## json-server endpoints (maps to NestJS routes later)

| json-server | NestJS (future) | Resource |
|---|---|---|
| GET /cards | GET /api/v1/cards | All cards |
| GET /cards/:id | GET /api/v1/cards/:id | Single card |
| POST /cards | POST /api/v1/cards | Create card |
| PATCH /cards/:id | PATCH /api/v1/cards/:id | Update card |
| DELETE /cards/:id | DELETE /api/v1/cards/:id | Delete card |
| GET /categories | GET /api/v1/categories | All categories |
| POST /categories | POST /api/v1/categories | Create category |
| GET /decks | GET /api/v1/decks | All decks |
| GET /users | GET /api/v1/users | Users |
| GET /srsStates | GET /api/v1/srs | SRS states |
| GET /reviewSessions | GET /api/v1/review/sessions | Sessions |
| GET /progressStats | GET /api/v1/progress/stats | Progress |

**json-server filtering** (used in development, mirrored by NestJS query params):
```
GET /cards?categoryIds_like=cat-001     → filter by category
GET /cards?content.article=der         → filter by article
GET /cards?_page=1&_limit=20           → pagination
GET /cards?_sort=createdAt&_order=desc → sorting
```

---

## db.json structure (json-server data file)

Top-level keys match the REST resource names:
```json
{
  "users": [...],
  "decks": [...],
  "cards": [...],
  "categories": [...],
  "srsStates": [...],
  "reviewSessions": [...],
  "progressStats": [...],
  "audioAssets": [...]
}
```

---

## Models — where types live

All TypeScript types are in `src/app/data/models/`. Each model file has:
1. The main interface (`Card`, `Category`, etc.)
2. The DTO interfaces (`CreateCardDto`, `UpdateCardDto`)
3. Query param interfaces (`CardQueryParams`)
4. Enums if applicable

**Never import models from the old `mock-data.ts`** — that file is superseded by the split model files.

---

## Interceptors

### `auth.interceptor.ts`
Attaches `Authorization: Bearer <token>` to every outgoing request.
Intercepts 401 responses → triggers token refresh → retries original request.

### `error.interceptor.ts`
Catches all HTTP errors globally.
- 401 → redirect to /auth/login
- 403 → show "Access denied" toast
- 404 → show "Not found" toast
- 500 → show "Server error, try again" toast
- Network error → show "You appear to be offline" toast

---

## Article gender colour system (CRITICAL — apply everywhere)

| Article | Gender | Background | Text | Border | CSS class |
|---|---|---|---|---|---|
| `der` | Masculine | `#EAF2FC` | `#1A56A3` | `#85B7EB` | `.lc-article-badge--der` |
| `die` | Feminine | `#FEF2F2` | `#B91C1C` | `#FCA5A5` | `.lc-article-badge--die` |
| `das` | Neuter | `#F1EFE8` | `#5F5E5A` | `#B4B2A9` | `.lc-article-badge--das` |
| `null` | None (verbs/adj) | — | — | — | No badge rendered |

**Rule:** colour is never the sole signal — badge always includes the text `der`/`die`/`das` (accessibility).

---

## Design tokens (all in src/theme/variables.css)

```css
--lc-brand:        #2D5A4E   /* primary green — buttons, nav, hero */
--lc-brand-light:  #E8F2EE   /* green tint — backgrounds, chips */
--lc-brand-mid:    #4A8C7A   /* medium green — secondary text */
--lc-accent:       #E07B3F   /* orange — FAB, CTA, highlights */
--lc-font-display: 'Lora', Georgia, serif      /* card words, titles, numbers */
--lc-font-body:    'DM Sans', system-ui        /* all UI labels, buttons */
--lc-radius-md:    12px      /* standard cards, word items */
--lc-radius-xl:    28px      /* hero card, flashcard, bottom sheet */
--lc-flip-duration: 300ms    /* flashcard 3D CSS flip transition */
```

---

## Mastery levels

| Level | Label | Dot colour | Meaning |
|---|---|---|---|
| 0 | New | `#D1D5DB` grey | Never reviewed |
| 1 | Beginner | `#FCA5A5` red | Barely recalled |
| 2 | Learning | `#FCD34D` yellow | Recalled with effort |
| 3 | Familiar | `#6EE7B7` light green | Good recall |
| 4 | Good | `#34D399` green | Easy recall |
| 5 | Mastered | `#059669` dark green | Instant recall |

---

## SRS algorithm (SM-2)

Rating 0–5 maps to: Blank / Hard / Hmm / Good / Easy / Nailed.
- Rating < 3 → reset interval (1–2 days), lower ease factor
- Rating >= 3 → interval × easeFactor, ease factor adjusts
- SRSState per card per user — stored in `srsStates` collection
- `nextDueAt` is indexed for due-card queries

---

## Epics

| Epic | Name | Status |
|---|---|---|
| 1 | Vocabulary Vault | **IN DEVELOPMENT** |
| 2 | Listen & Learn | Designed, not started |
| 3 | Fill the Gap (Cloze) | Planned |
| 4 | Smart SRS Engine | Planned |
| 5 | Progress Dashboard | Planned |
| 6 | Community Decks | Planned |
| 7 | AI Tutor | Planned |

---

## Key architectural rules (always follow)

1. **Never hardcode German** — everything goes through `LearningContext` interface
2. **Never subscribe in a service** — return `Observable<T>`, let components/stores subscribe
3. **Never use `any`** — every HTTP call has a typed generic
4. **Offline-first** — writes go to local store first, sync queue handles server
5. **Standalone components only** — no NgModule declarations
6. **Lazy-load every feature** — `loadComponent` in routes
7. **One service per resource** — `CardService` only touches `/cards`
8. **DTOs for writes** — `CreateCardDto` not `Partial<Card>` for POST/PATCH
9. **Environment for all URLs** — never hardcode `localhost:3000` in a service
10. **Swap mock → real = one line** — `{ provide: CardService, useClass: CardApiService }`

---

## Full documentation in this project

- `CLAUDE.md` — this file (always read first)
- `db.json` — json-server data (source of truth for shape of all resources)
- `src/app/data/models/` — TypeScript interfaces (source of truth for types)
- `src/app/data/services/` — HTTP services (one per resource)
- `src/theme/variables.css` — all design tokens
- `docs/architecture.docx` — full frontend + backend architecture specification
