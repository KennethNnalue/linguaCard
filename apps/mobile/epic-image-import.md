# Epic: Image-Based Vocabulary Import
## Scan or Photo → AI Card Generation

> **Epic Number:** LC-080 (continuing from LC-071 Gemini TTS)
> **Feature Area:** `features/vault/import/`
> **Depends on:** Existing CSV import flow (`import.page.ts`, `import-review.page.ts`, `csv-parser.service.ts`), Gemini AI integration (`features/ai/`), shared domain types (`libs/shared/domain/src/index.ts`)
> **New Routes:** `/vault/import/image`, `/vault/import/image/processing`, `/vault/import/image/review`
> **AI Provider:** Gemini Vision (multimodal) — consistent with existing Gemini TTS strategy

---

## Context & Background

The existing collection import flow (`/vault/import`) allows users to upload a `.csv` file matching the schema:

```
front, back, article, categoryId, exampleTarget, exampleNative
```

`CsvParserService` parses this into `ParsedImportRow[]`, passed to `ImportStateService`, then rendered at `/vault/import/review` where the user picks a collection and confirms.

This epic **extends** that import entry point to also accept images (gallery picks or live camera captures). Instead of CSV parsing, a Gemini Vision API call extracts all vocabulary words and generates the same `ParsedImportRow[]` shape — so the existing `import-review` page and card-creation logic reuse unchanged.

---

## Story Map

| Phase | Ticket | Title | Points |
|-------|--------|-------|--------|
| 0 — Domain | LC-080 | Extend shared domain types for image import | 1 |
| 1 — Backend | LC-081 | NestJS: image-to-cards Gemini Vision endpoint | 5 |
| 1 — Backend | LC-082 | Image validation, compression & storage service | 3 |
| 1 — Backend | LC-083 | Gemini prompt builder for vocabulary extraction | 3 |
| 2 — Shared | LC-084 | Shared image-import UI component (picker + camera) | 3 |
| 3 — Mobile | LC-085 | Image import entry page (`/vault/import/image`) | 3 |
| 3 — Mobile | LC-086 | AI processing screen (animated in-progress state) | 2 |
| 3 — Mobile | LC-087 | Image import review page (`/vault/import/image/review`) | 3 |
| 3 — Mobile | LC-088 | Extend import entry page to surface image import option | 2 |
| 4 — Polish | LC-089 | Word selection & deselection on review screen | 3 |
| 4 — Polish | LC-090 | Error states: no words found, poor image quality | 2 |
| 4 — Polish | LC-091 | Image preview thumbnail on review confirmation screen | 1 |
| 5 — Sync | LC-092 | Sync handler: image import operations (offline queue) | 2 |
| 5 — Sync | LC-093 | Image import analytics event tracking | 1 |

**Total: 34 points**

---

---

## LC-080 · Extend shared domain types for image import

**Epic:** Image Import
**Phase:** 0 — Do this first (unblocks all other tickets)
**Points:** 1
**Depends on:** nothing

### User story

As a developer, I want the shared domain type library to include types for image import requests and results, so that the Angular mobile app and NestJS API share a single, correct contract from day one.

### Files to modify

| File | Change |
|------|--------|
| `libs/shared/domain/src/index.ts` | Add `ImageImportRequest`, `ImageImportResult`, `ImageExtractedWord` types |

### New types to add

```typescript
// ─── IMAGE IMPORT ─────────────────────────────────────────────────────────────

export interface ImageExtractedWord {
  front: string;           // English translation (AI-generated)
  back: string;            // German word as it appears in image
  article: ArticleType | null;  // der/die/das — null for verbs/adjectives
  categoryName: string;    // AI-suggested category (e.g. "Food", "Travel")
  exampleTarget: string;   // AI-generated German example sentence
  exampleNative: string;   // AI-generated English translation of example
  confidence: number;      // 0–1, Gemini confidence score for this word
  boundingBoxHint?: string; // Optional: rough image region for display
}

export interface ImageImportRequest {
  imageBase64: string;     // Base64-encoded image (jpeg/png/webp)
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  targetLanguage: string;  // e.g. 'de' — the language to extract
  nativeLanguage: string;  // e.g. 'en' — the user's native language
  userId: string;
  contextId: string;
}

export interface ImageImportResult {
  words: ImageExtractedWord[];
  totalFound: number;
  imageDescription: string; // Brief description of what Gemini saw
  processingMs: number;
  modelUsed: string;
}
```

### Acceptance criteria

- [ ] `ImageExtractedWord`, `ImageImportRequest`, `ImageImportResult` exported from `libs/shared/domain/src/index.ts`
- [ ] `ImageExtractedWord` maps cleanly to `ParsedImportRow` (same shape, different source)
- [ ] Types compile without errors in both `apps/api` and `apps/mobile`
- [ ] `confidence` field is `number` (0–1), not a string

---

---

## LC-081 · NestJS: image-to-cards Gemini Vision endpoint

**Epic:** Image Import
**Phase:** 1 — Backend
**Points:** 5
**Depends on:** LC-080

### User story

As a mobile app, I want to POST a base64-encoded image to `/import/image` and receive a structured list of vocabulary words with translations, articles, and example sentences, so that the mobile front end can present them for user review without any additional API calls.

### Files to create / modify

| File | Change |
|------|--------|
| `apps/api/src/import/import.module.ts` | New NestJS module |
| `apps/api/src/import/import.controller.ts` | New: `POST /import/image` |
| `apps/api/src/import/image-import.service.ts` | New: orchestrates Gemini call + result mapping |
| `apps/api/src/import/image-import-prompt.builder.ts` | New: builds Gemini multimodal prompt |
| `apps/api/src/app.module.ts` | Register `ImportModule` |

### API contract

```
POST /import/image
Content-Type: application/json
Authorization: Bearer <jwt>

Body: ImageImportRequest
Response 200: ImageImportResult
Response 400: { message: 'No words detected in image' }
Response 422: { message: 'Image quality too low for processing' }
Response 500: { message: 'AI processing failed. Please try again.' }
```

### Implementation notes

```typescript
// apps/api/src/import/image-import.service.ts

@Injectable()
export class ImageImportService {
  async extractWords(dto: ImageImportRequest): Promise<ImageImportResult> {
    const prompt = this.promptBuilder.build(dto);
    const startMs = Date.now();

    // Gemini multimodal call — image + text prompt
    const response = await this.gemini.generateText({
      messages: [{
        role: 'user',
        content: [
          { type: 'image', data: dto.imageBase64, mimeType: dto.mimeType },
          { type: 'text', text: prompt }
        ]
      }],
      maxTokens: 4096,
    });

    const parsed = this.parseGeminiResponse(response.text);

    if (parsed.length === 0) {
      throw new BadRequestException('No words detected in image');
    }

    return {
      words: parsed,
      totalFound: parsed.length,
      imageDescription: parsed.description ?? '',
      processingMs: Date.now() - startMs,
      modelUsed: response.model,
    };
  }
}
```

### Acceptance criteria

- [ ] `POST /import/image` returns `ImageImportResult` with `words[]` array
- [ ] Each word has `front`, `back`, `article`, `categoryName`, `exampleTarget`, `exampleNative`, `confidence`
- [ ] Articles are correctly identified as `der`/`die`/`das` or `null` for non-nouns
- [ ] If Gemini returns malformed JSON, service throws `InternalServerErrorException` with raw response logged
- [ ] If image yields 0 words, returns `400` with message `'No words detected in image'`
- [ ] Endpoint is protected by JWT auth guard
- [ ] Unit test: `ImageImportPromptBuilder.build()` with a mock `ImageImportRequest` returns a prompt containing the target and native language

---

---

## LC-082 · Image validation, compression & storage service

**Epic:** Image Import
**Phase:** 1 — Backend
**Points:** 3
**Depends on:** LC-081

### User story

As the API, I want to validate and compress uploaded images before sending them to Gemini, so that we stay within Gemini's token limits, reduce latency, and reject malformed or oversized images early before any AI costs are incurred.

### Files to create

| File | Change |
|------|--------|
| `apps/api/src/import/image-validation.service.ts` | New: validates mime type, file size, image dimensions |
| `apps/api/src/import/image-compression.service.ts` | New: resizes/compresses to max 1024px, 500KB |

### Validation rules

```typescript
const IMAGE_CONSTRAINTS = {
  maxFileSizeBytes: 5 * 1024 * 1024,  // 5MB raw upload limit
  maxGeminiSizeBytes: 500 * 1024,      // 500KB after compression
  maxDimensionPx: 1920,
  targetDimensionPx: 1024,             // Resize to this before Gemini
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
};
```

### Acceptance criteria

- [ ] Images over 5MB are rejected with `413 Payload Too Large` before any processing
- [ ] Images with unsupported mime types return `400 Unsupported image format`
- [ ] Images larger than 1024px on the longest side are resized proportionally
- [ ] Compressed image is under 500KB before Gemini submission
- [ ] EXIF orientation is normalised so rotated photos from mobile cameras render correctly
- [ ] Unit test: 4MB JPEG input → output under 500KB at ≤1024px
- [ ] Unit test: `.gif` input → `400` response

---

---

## LC-083 · Gemini prompt builder for vocabulary extraction

**Epic:** Image Import
**Phase:** 1 — Backend
**Points:** 3
**Depends on:** LC-080

### User story

As the image import service, I want a dedicated prompt builder that instructs Gemini precisely how to extract vocabulary from an image, so that the output is always structured JSON matching `ImageExtractedWord[]` and results are consistent across image types.

### Files to create

| File | Change |
|------|--------|
| `apps/api/src/import/image-import-prompt.builder.ts` | New: builds Gemini multimodal prompt |

### Prompt strategy

The prompt must instruct Gemini to:
1. Identify all visible words or vocabulary items in the target language (`targetLanguage`)
2. For each word, generate: translation, grammatical article (if applicable), a natural example sentence in the target language, and an English translation of that sentence
3. Assign a suggested category from a fixed list: Food, Travel, Home, Work, People, Nature, Transport, Shopping, Health, Other
4. Return **only valid JSON** — no preamble, no markdown fences
5. Assign a confidence score (0.0–1.0) based on clarity of the word in the image

```typescript
// Prompt template skeleton
const SYSTEM_PROMPT = `
You are a language learning assistant that extracts vocabulary from images.
Analyse the attached image and identify all ${targetLanguage} words or phrases visible.

For each word, return a JSON array. Each element must have:
- "back": the word exactly as it appears in the image (${targetLanguage})
- "front": the English translation
- "article": "der", "die", "das", or null (null for verbs, adjectives, phrases)
- "categoryName": one of [Food, Travel, Home, Work, People, Nature, Transport, Shopping, Health, Other]
- "exampleTarget": a natural ${targetLanguage} sentence using this word
- "exampleNative": English translation of that sentence
- "confidence": float between 0 and 1

Return ONLY the JSON array. No explanation. No markdown. No extra text.
If no ${targetLanguage} words are visible, return an empty array [].
`;
```

### Acceptance criteria

- [ ] Prompt instructs Gemini to return JSON only (no markdown blocks)
- [ ] Prompt specifies all 6 required fields per word
- [ ] `article` is constrained to `der | die | das | null`
- [ ] Category is constrained to the fixed list above (reduces hallucination)
- [ ] Unit test: prompt built for `targetLanguage: 'de'` contains `"der", "die", "das"` constraint text
- [ ] Unit test: prompt built for a non-German language omits article instruction (extensibility)
- [ ] Service handles Gemini returning an empty array `[]` gracefully (no crash)

---

---

## LC-084 · Shared image-import UI component (picker + camera)

**Epic:** Image Import
**Phase:** 2 — Shared mobile layer
**Points:** 3
**Depends on:** LC-080

### User story

As a developer, I want a reusable Angular component in `shared/image/` that encapsulates the camera/gallery picker UI, so that the image import page and any future scanner feature can use it without duplicating Capacitor Camera plugin integration.

### Files to create

| File | Change |
|------|--------|
| `apps/mobile/src/app/shared/image/image-picker/image-picker.component.ts` | New component |
| `apps/mobile/src/app/shared/image/image-picker/image-picker.component.html` | New template |
| `apps/mobile/src/app/shared/image/image-picker/image-picker.component.scss` | New styles |
| `apps/mobile/src/app/shared/image/image.model.ts` | `PickedImage` type |

### Component API

```typescript
// image-picker.component.ts
@Component({ selector: 'lc-image-picker', ... })
export class ImagePickerComponent {
  @Output() imagePicked = new EventEmitter<PickedImage>();
  @Output() pickCancelled = new EventEmitter<void>();
  @Output() pickError = new EventEmitter<string>();

  async pickFromCamera(): Promise<void> { ... }
  async pickFromGallery(): Promise<void> { ... }
}

// image.model.ts
export interface PickedImage {
  base64: string;           // base64 data (no data: prefix)
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
  height: number;
  fileSizeBytes: number;
  source: 'camera' | 'gallery';
}
```

### Capacitor Camera integration

```typescript
// Uses @capacitor/camera with fallback to <input type="file"> on web
import { Camera, CameraSource, CameraResultType } from '@capacitor/camera';

async pickFromCamera(): Promise<void> {
  const photo = await Camera.getPhoto({
    quality: 85,
    source: CameraSource.Camera,
    resultType: CameraResultType.Base64,
  });
  this.imagePicked.emit(this.toPickedImage(photo, 'camera'));
}

async pickFromGallery(): Promise<void> {
  const photo = await Camera.getPhoto({
    quality: 85,
    source: CameraSource.Photos,
    resultType: CameraResultType.Base64,
  });
  this.imagePicked.emit(this.toPickedImage(photo, 'gallery'));
}
```

### Acceptance criteria

- [ ] Component emits `imagePicked` with a valid `PickedImage` when user picks from gallery
- [ ] Component emits `imagePicked` with a valid `PickedImage` when user takes a photo
- [ ] Component emits `pickCancelled` when user dismisses without selecting
- [ ] Component emits `pickError` with a descriptive message on permission denial
- [ ] On web (non-Capacitor), component falls back to `<input type="file" accept="image/*">`
- [ ] Component lives in `shared/image/` and knows nothing about vault or card creation
- [ ] No direct router navigation inside the component — parent handles routing

---

---

## LC-085 · Image import entry page (`/vault/import/image`)

**Epic:** Image Import
**Phase:** 3 — Mobile pages
**Points:** 3
**Depends on:** LC-084, LC-081

### User story

As a user, I want to navigate to a dedicated image import page where I can either take a photo of a menu, flashcard, page, or label, or pick an image from my gallery, so that I can start the AI vocabulary extraction flow.

### Files to create

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/vault/import/pages/image-import/image-import.page.ts` | New page |
| `apps/mobile/src/app/features/vault/import/pages/image-import/image-import.page.html` | New template |
| `apps/mobile/src/app/features/vault/import/pages/image-import/image-import.page.scss` | New styles |
| `apps/mobile/src/app/features/vault/import/image-import-state.service.ts` | New wizard-state service |
| `apps/mobile/src/app/app.routes.ts` | Add 3 new routes |

### New routes to add in `app.routes.ts`

```typescript
{
  path: 'vault/import/image',
  loadComponent: () =>
    import('./features/vault/import/pages/image-import/image-import.page')
      .then(m => m.ImageImportPage),
},
{
  path: 'vault/import/image/processing',
  loadComponent: () =>
    import('./features/vault/import/pages/image-processing/image-processing.page')
      .then(m => m.ImageProcessingPage),
},
{
  path: 'vault/import/image/review',
  loadComponent: () =>
    import('./features/vault/import/pages/image-import-review/image-import-review.page')
      .then(m => m.ImageImportReviewPage),
},
```

### `ImageImportStateService`

```typescript
// features/vault/import/image-import-state.service.ts
@Injectable({ providedIn: 'root' })
export class ImageImportStateService {
  private readonly _image = signal<PickedImage | null>(null);
  private readonly _result = signal<ImageImportResult | null>(null);

  readonly image = this._image.asReadonly();
  readonly result = this._result.asReadonly();

  setImage(img: PickedImage): void { this._image.set(img); }
  setResult(r: ImageImportResult): void { this._result.set(r); }
  clear(): void { this._image.set(null); this._result.set(null); }
}
```

### Page logic

```typescript
@Component(...)
export class ImageImportPage {
  private readonly router = inject(Router);
  private readonly importImageState = inject(ImageImportStateService);
  private readonly toastCtrl = inject(ToastController);

  onImagePicked(image: PickedImage): void {
    this.importImageState.setImage(image);
    this.router.navigate(['/vault/import/image/processing']);
  }

  async onPickError(msg: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message: msg, duration: 3000, color: 'warning' });
    await toast.present();
  }

  goBack(): void { this.router.navigate(['/vault/import']); }
}
```

### Acceptance criteria

- [ ] Page renders at `/vault/import/image` with back button navigating to `/vault/import`
- [ ] "Take a photo" button triggers camera via `lc-image-picker`
- [ ] "Choose from gallery" button triggers gallery picker via `lc-image-picker`
- [ ] On successful image pick, `ImageImportStateService.setImage()` is called and router navigates to `/vault/import/image/processing`
- [ ] On pick error, toast shown with error message
- [ ] Page style matches existing import page design tokens (brand colours, fonts, radius)
- [ ] All 3 routes are lazy-loaded via `loadComponent`

---

---

## LC-086 · AI processing screen (animated in-progress state)

**Epic:** Image Import
**Phase:** 3 — Mobile pages
**Points:** 2
**Depends on:** LC-085, LC-081

### User story

As a user, after I pick an image, I want to see a clear, animated processing screen that shows my image thumbnail and communicates that AI is scanning it for words, so that I know the app is working and I understand what is happening.

### Files to create

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/vault/import/pages/image-processing/image-processing.page.ts` | New page |
| `apps/mobile/src/app/features/vault/import/pages/image-processing/image-processing.page.html` | New template |
| `apps/mobile/src/app/features/vault/import/pages/image-processing/image-processing.page.scss` | New styles |
| `apps/mobile/src/app/features/vault/import/services/image-import-api.service.ts` | New API service |

### Page logic

```typescript
@Component(...)
export class ImageProcessingPage implements OnInit, OnDestroy {
  private readonly importImageState = inject(ImageImportStateService);
  private readonly imageImportApi = inject(ImageImportApiService);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);

  readonly image = this.importImageState.image;
  readonly statusPhase = signal<0 | 1 | 2>(0);
  private timers: ReturnType<typeof setTimeout>[] = [];

  ngOnInit(): void {
    if (!this.image()) {
      this.router.navigate(['/vault/import/image']);
      return;
    }
    this.startStatusCycling();
    this.callApi(this.image()!);
  }

  private startStatusCycling(): void {
    this.timers.push(setTimeout(() => this.statusPhase.set(1), 2000));
    this.timers.push(setTimeout(() => this.statusPhase.set(2), 4500));
  }

  private callApi(image: PickedImage): void {
    this.imageImportApi.extractWords(image).subscribe({
      next: (result) => {
        this.importImageState.setResult(result);
        this.router.navigate(['/vault/import/image/review']);
      },
      error: async (err) => {
        this.importImageState.clear();
        const toast = await this.toastCtrl.create({
          message: err.error?.message ?? 'Something went wrong. Please try again.',
          duration: 3500, color: 'danger',
        });
        await toast.present();
        this.router.navigate(['/vault/import/image']);
      }
    });
  }

  cancel(): void {
    this.importImageState.clear();
    this.router.navigate(['/vault/import/image']);
  }

  ngOnDestroy(): void { this.timers.forEach(clearTimeout); }
}
```

### `ImageImportApiService`

```typescript
// features/vault/import/services/image-import-api.service.ts
@Injectable({ providedIn: 'root' })
export class ImageImportApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  extractWords(image: PickedImage): Observable<ImageImportResult> {
    const body: ImageImportRequest = {
      imageBase64: image.base64,
      mimeType: image.mimeType,
      targetLanguage: 'de',
      nativeLanguage: 'en',
      userId: this.auth.currentUser()!.id,
      contextId: 'german-vocab',
    };
    return this.http.post<ImageImportResult>(`${environment.apiUrl}/import/image`, body);
  }
}
```

### Status copy by phase

| Phase | Copy |
|---|---|
| 0 | "Scanning your image…" |
| 1 | "Spotting vocabulary…" |
| 2 | "Generating examples…" |

### Acceptance criteria

- [ ] Page shows the picked image thumbnail from `ImageImportStateService`
- [ ] CSS scan-line animation plays on loop over the image thumbnail while API is in flight
- [ ] Status text cycles through three phases with ~2.5s delay between each (cosmetic only)
- [ ] Skeleton word chips appear staggered below the status text
- [ ] If `ImageImportStateService.image()` is null on init, redirects to `/vault/import/image`
- [ ] On successful API response, navigates to `/vault/import/image/review`
- [ ] On API error, navigates back with error toast
- [ ] "Cancel" link clears state and navigates back
- [ ] Back hardware button is disabled during API call (Capacitor `BackButton` handler)

---

---

## LC-087 · Image import review page (`/vault/import/image/review`)

**Epic:** Image Import
**Phase:** 3 — Mobile pages
**Points:** 3
**Depends on:** LC-086

### User story

As a user, after the AI has scanned my image, I want to review the list of extracted words before they're added to my vault, so that I can deselect incorrect or unwanted words, assign them to a collection, and confirm the import.

### Files to create

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/vault/import/pages/image-import-review/image-import-review.page.ts` | New page |
| `apps/mobile/src/app/features/vault/import/pages/image-import-review/image-import-review.page.html` | New template |
| `apps/mobile/src/app/features/vault/import/pages/image-import-review/image-import-review.page.scss` | New styles |

### Mapping `ImageExtractedWord` → `ParsedImportRow`

```typescript
private toImportRow(word: ImageExtractedWord, index: number): ParsedImportRow {
  const cat = this.categoryStore.categories()
    .find(c => c.name.toLowerCase() === word.categoryName.toLowerCase());

  return {
    rowIndex: index + 1,
    front: word.front,
    back: word.back,
    article: word.article,
    categoryId: cat?.id ?? '',
    exampleTarget: word.exampleTarget,
    exampleNative: word.exampleNative,
    status: word.confidence >= 0.6 ? 'valid' : 'warning',
    warningMessages: word.confidence < 0.6 ? ['Low confidence — please verify'] : [],
    errorMessages: [],
  };
}
```

Card creation reuses the exact `confirmImport()` logic from `import-review.page.ts` — `cardApi.create()` → `forkJoin` — no duplication of card-creation code.

### Acceptance criteria

- [ ] Page renders at `/vault/import/image/review` with image thumbnail + word count
- [ ] All extracted words shown with checkbox, article badge, German word, English translation
- [ ] Words with `confidence < 0.7` show amber warning indicator
- [ ] User can deselect individual words; deselected words are visually dimmed
- [ ] Collection picker is required — import button disabled until selected
- [ ] "Import N words to Vault" button reflects count of currently-selected words
- [ ] Confirm triggers `cardApi.create()` for each selected row (same as CSV import)
- [ ] On success: toast "✓ N words added to your Vault", navigate to `/vault`, clear `ImageImportStateService`
- [ ] If `ImageImportStateService.result()` is null on init, redirect to `/vault/import/image`

---

---

## LC-088 · Extend import entry page to surface image import option

**Epic:** Image Import
**Phase:** 3 — Mobile pages
**Points:** 2
**Depends on:** LC-085

### User story

As a user on the existing `/vault/import` CSV import page, I want to see a clearly visible option to import from an image (or take a photo), so that I can discover the new feature without having to know a separate URL.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/vault/pages/import/import.page.html` | Add image import button below drop zone |
| `apps/mobile/src/app/features/vault/pages/import/import.page.ts` | Add `navigateToImageImport()` method |
| `apps/mobile/src/app/features/vault/pages/import/import.page.scss` | Add styles for new section |

### UX change

Below the existing CSV drop zone and "or" divider, add:

```html
<!-- "or scan an image" section -->
<div class="imp-or">
  <div class="imp-or-line"></div>
  <span class="imp-or-txt">or scan an image</span>
  <div class="imp-or-line"></div>
</div>

<button class="imp-image-btn" (click)="navigateToImageImport()">
  <ion-icon name="camera-outline"></ion-icon>
  Import from Image
  <span class="imp-image-sub">Menus, pages, flashcards…</span>
</button>
```

### Acceptance criteria

- [ ] Existing CSV drop zone and download template button are fully unchanged
- [ ] A new "Import from Image" button appears below the CSV zone with a camera icon
- [ ] Clicking it navigates to `/vault/import/image`
- [ ] Button style matches the design system (`--lc-brand` outlined, `--lc-radius-md`)
- [ ] Section labelled "or scan an image"
- [ ] Existing CSV import flow is fully unaffected

---

---

## LC-089 · Word selection & deselection on review screen

**Epic:** Image Import
**Phase:** 4 — Polish
**Points:** 3
**Depends on:** LC-087

### User story

As a user reviewing AI-extracted words, I want to be able to select or deselect individual words (and select/deselect all at once), so that I have full control over exactly which words get added to my collection.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/vault/import/pages/image-import-review/image-import-review.page.ts` | Add selection state with signals |
| `apps/mobile/src/app/features/vault/import/pages/image-import-review/image-import-review.page.html` | Add checkboxes and select-all control |

### Implementation notes

```typescript
interface SelectableWord extends ParsedImportRow {
  id: number;
  selected: boolean;
  confidence: number;
}

readonly wordList = signal<SelectableWord[]>([]);

ngOnInit(): void {
  const words = this.importImageState.result()?.words ?? [];
  this.wordList.set(words.map((w, i) => ({
    ...this.toImportRow(w, i),
    id: i,
    selected: true,
    confidence: w.confidence,
  })));
}

toggleWord(id: number): void {
  this.wordList.update(ws => ws.map(w => w.id === id ? { ...w, selected: !w.selected } : w));
}

toggleAll(): void {
  const allSelected = this.wordList().every(w => w.selected);
  this.wordList.update(ws => ws.map(w => ({ ...w, selected: !allSelected })));
}

readonly selectedWords = computed(() => this.wordList().filter(w => w.selected));
readonly selectedCount = computed(() => this.selectedWords().length);
```

### Acceptance criteria

- [ ] Each word row has a visible checkbox on the left
- [ ] Tapping a word row (or checkbox) toggles its selected state
- [ ] Deselected words are visually dimmed (opacity 0.4) but remain in the list
- [ ] "Select all / Deselect all" toggle in the summary header
- [ ] Import button text dynamically updates: "Import 7 words to Vault"
- [ ] Import button disabled when 0 words are selected
- [ ] Only selected words are passed to `cardApi.create()`

---

---

## LC-090 · Error states: no words found, poor image quality

**Epic:** Image Import
**Phase:** 4 — Polish
**Points:** 2
**Depends on:** LC-086

### User story

As a user, when the AI cannot extract any words from my image (blurry, no German text, wrong language), I want to see a clear, helpful error message with actionable next steps rather than a confusing blank screen or generic error.

### Error scenarios

| HTTP Status | User-facing message | Suggested action |
|---|---|---|
| 400 No words detected | "No German words found in this image" | "Try a clearer photo, or use CSV import" |
| 422 Image quality too low | "Image is too blurry to read" | "Retake with better lighting" |
| 413 File too large | "Image is too large (max 5MB)" | "Use a smaller image" |
| 500 AI error | "Something went wrong. Try again." | Retry button |
| Network error | "No internet connection" | "Check your connection" |

### Error state UI

When navigated back to `/vault/import/image` with an error code, the page shows a contextual inline error banner (persistent, dismissible):

```
⚠️  No German words found in this image
    Try a clearer photo or switch to CSV import.
    [Try again]  [Use CSV]
```

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/vault/import/image-import-state.service.ts` | Add `error` signal |
| `apps/mobile/src/app/features/vault/import/pages/image-processing/image-processing.page.ts` | Set error code on `ImageImportStateService` before navigating back |
| `apps/mobile/src/app/features/vault/import/pages/image-import/image-import.page.html` | Render error banner if `error()` is set |
| `apps/mobile/src/app/features/vault/import/pages/image-import/image-import.page.ts` | Dismiss error on new pick attempt |

### Acceptance criteria

- [ ] 400 response → navigates back with "no words" error banner
- [ ] 422 response → navigates back with "blurry image" error banner
- [ ] 413 detected client-side → shows error before API call
- [ ] 500 response → generic error with retry button
- [ ] Error banner is dismissible (close icon)
- [ ] "Use CSV" button navigates to `/vault/import`
- [ ] "Try again" button clears error state and re-opens picker

---

---

## LC-091 · Image preview thumbnail on review screen

**Epic:** Image Import
**Phase:** 4 — Polish
**Points:** 1
**Depends on:** LC-087

### User story

As a user on the image import review screen, I want to see a small thumbnail of the image I uploaded in the file info bar, so that I have visual confirmation I'm reviewing the right image.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/vault/import/pages/image-import-review/image-import-review.page.html` | Add `<img>` thumbnail to the file info bar |
| `apps/mobile/src/app/features/vault/import/pages/image-import-review/image-import-review.page.ts` | Read `image` from `ImageImportStateService` |

### UI change

```html
<!-- File info bar — extended for image import -->
<div class="imp-file-bar">
  <img
    *ngIf="image()"
    class="imp-thumb"
    [src]="'data:' + image()!.mimeType + ';base64,' + image()!.base64"
    alt="Uploaded image" />
  <ion-icon *ngIf="!image()" name="image-outline" class="imp-file-icon"></ion-icon>
  <div style="flex:1;min-width:0;">
    <div class="imp-file-name">{{ result()?.totalFound }} words detected</div>
    <div class="imp-file-meta">AI-scanned · {{ image()?.mimeType }}</div>
  </div>
  <ion-icon name="checkmark-circle" style="color: var(--lc-brand);"></ion-icon>
</div>
```

### Acceptance criteria

- [ ] Image thumbnail (60×60px, `border-radius: 10px`, `object-fit: cover`) in the file info bar
- [ ] Thumbnail shows actual uploaded image
- [ ] If `ImageImportStateService.image()` is null, falls back to generic image icon
- [ ] Thumbnail has `border: 1px solid var(--lc-brand)` styling

---

---

## LC-092 · Sync handler: image import operations (offline queue)

**Epic:** Image Import
**Phase:** 5 — Sync
**Points:** 2
**Depends on:** LC-087

### User story

As a user who imports vocabulary from an image while offline, I want the cards to be queued and synced automatically when I reconnect, consistent with how CSV-imported cards are handled.

### Context

Image-imported cards go through the same `cardApi.create()` path in `confirmImport()` as CSV-imported cards. The existing `SyncService` + `CREATE_CARD` operation type handles this automatically. This ticket is verification + explicit integration test coverage.

### Files to verify / modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/vault/import/pages/image-import-review/image-import-review.page.ts` | Confirm it uses `cardApi.create()` (not a raw HTTP call) |
| `apps/api/src/import/import.controller.ts` | Add comment: `/import/image` is stateless; card sync is handled by `CREATE_CARD` |

### Acceptance criteria

- [ ] Image-imported cards are created via the same `cardApi.create()` Observable chain as CSV imports
- [ ] If device is offline when user taps confirm, cards are queued in `SyncService`
- [ ] Sync runs automatically when connectivity is restored
- [ ] No new `SyncOperation` type is required — existing `CREATE_CARD` covers this
- [ ] Integration test: import 3 words offline → reconnect → all 3 cards appear in vault

---

---

## LC-093 · Image import analytics event tracking

**Epic:** Image Import
**Phase:** 5 — Observability
**Points:** 1
**Depends on:** LC-087

### User story

As the product team, I want image import usage events tracked, so that we can measure feature adoption and identify friction points.

### Events to track

| Event name | Fired when | Properties |
|---|---|---|
| `image_import_started` | User picks an image | `source: 'camera' \| 'gallery'` |
| `image_import_processed` | API returns successfully | `wordsFound: number`, `processingMs: number` |
| `image_import_error` | API returns error | `errorCode: string`, `httpStatus: number` |
| `image_import_confirmed` | User taps confirm | `wordsSelected: number`, `wordsDeselected: number`, `collectionId: string` |
| `image_import_cancelled` | User cancels on processing screen | — |

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/vault/import/pages/image-processing/image-processing.page.ts` | Emit `image_import_started`, `image_import_processed`, `image_import_error` |
| `apps/mobile/src/app/features/vault/import/pages/image-import-review/image-import-review.page.ts` | Emit `image_import_confirmed` |

### Acceptance criteria

- [ ] All 5 events fire at the correct lifecycle moments
- [ ] Events include the specified properties
- [ ] Analytics calls are fire-and-forget (no await, no error handling in UI)

---

---

## New Screens — Design Spec

All screens follow LinguaCard design tokens: `--lc-brand: #2D5A4E`, `--lc-accent: #E07B3F`, `DM Sans` body, `Lora` display, `--lc-radius-lg: 20px` for cards.

---

### Screen I01 · Import Entry — Extended (`/vault/import`)

**Change from existing Screen 06:** Adds image import option below the CSV drop zone.

```
┌─────────────────────────────────┐
│  ← Import to Vault              │  brand nav bar
├─────────────────────────────────┤
│                                 │
│  ┌ - - - - - - - - - - - - - ┐ │
│  |  ☁  Drop CSV file here    | │  existing drop zone — UNCHANGED
│  |  or tap to browse         | │
│  └ - - - - - - - - - - - - - ┘ │
│                                 │
│  ─────── or ─────────────────── │  existing divider
│                                 │
│  ┌─────────────────────────────┐│
│  │  📷  Import from Image    →││  NEW: outlined brand button
│  │      Menus, pages, cards   ││  border: --lc-brand, bg: --lc-brand-light
│  └─────────────────────────────┘│
│                                 │
│  ─────── or scan an image ───── │  NEW divider
│                                 │
│  ↓ Download CSV template        │  existing — UNCHANGED
└─────────────────────────────────┘
```

---

### Screen I02 · Image Source Picker (`/vault/import/image`)

```
┌─────────────────────────────────┐
│  ← Import from Image            │  brand nav, Lora title
├─────────────────────────────────┤
│                                 │
│  What would you like to scan?   │  --lc-text-secondary, 14px
│                                 │
│  ┌───────────────────────────┐  │
│  │  📷                       │  │  PRIMARY CTA
│  │  Take a photo             │  │  bg: --lc-accent, white text
│  │  Point at any German text │  │  --lc-radius-lg, shadow-float
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │  🖼️                       │  │  SECONDARY CTA
│  │  Choose from gallery      │  │  border: --lc-brand, bg: --lc-brand-light
│  │  Pick an existing photo   │  │  --lc-radius-lg
│  └───────────────────────────┘  │
│                                 │
│  ─── Tips ──────────────────── │
│  📋 Menus  💡 Good light  🔤 DE │  3-item horizontal chip row
└─────────────────────────────────┘
```

---

### Screen I03 · AI Processing (`/vault/import/image/processing`)

```
┌─────────────────────────────────┐
│                                 │
│       Scanning your image       │  Lora display, centred, 20px
│                                 │
│    ┌────────────────────────┐   │
│    │                        │   │
│    │    [user's image]      │◀──│── CSS scan-line: translucent bar
│    │                        │   │   sliding top→bottom, 2s loop
│    └────────────────────────┘   │  border-radius: --lc-radius-md
│                                 │
│        Spotting vocabulary…     │  status text, cycles every 2.5s
│                                 │
│    ░░░░░░  ░░░░░  ░░░░░░░       │  skeleton word chips
│    ░░░░░░░░  ░░░░░  ░░░░░       │  staggered fade-in, --lc-border bg
│                                 │
│                                 │
│           Cancel                │  small link, --lc-text-hint
└─────────────────────────────────┘
```

**Scan-line CSS:**
```scss
.scan-overlay {
  position: absolute; inset: 0; overflow: hidden; border-radius: inherit;
  pointer-events: none;
  &::after {
    content: '';
    position: absolute; top: -6px; left: 0; right: 0; height: 6px;
    background: linear-gradient(transparent, rgba(45,90,78,0.35), transparent);
    animation: scan-down 2s ease-in-out infinite;
  }
}
@keyframes scan-down {
  0%   { transform: translateY(0); }
  100% { transform: translateY(calc(100% + 300px)); }
}
```

---

### Screen I04 · Image Import Review (`/vault/import/image/review`)

```
┌─────────────────────────────────┐
│  ← Review Import                │
├─────────────────────────────────┤
│  ┌──────────────────────────┐   │
│  │ [60px thumb] 14 detected │   │  --lc-brand-light bg
│  │              AI-scanned  │   │  same style as CSV file info bar
│  └──────────────────────────┘   │
│                                 │
│   14 Total · ☑14 · ⚠2          │  summary stats row (identical to CSV)
│   [Select all]                   │  NEW: select-all toggle
│                                 │
│  Collection *required            │
│  ┌───────────────────────────┐  │  collection picker — identical to CSV
│  │ Select collection       ▼ │  │
│  └───────────────────────────┘  │
│                                 │
│  ☑ [der] Apfel · apple  Food 🟢 │
│  ☑ [die] Banane · banana Food 🟢│
│  ☑ [das] Obst · fruit   Food 🟡 │  amber = confidence < 0.7
│  ☑      essen · to eat  Food 🟢 │
│  ☐ [der] Tisch · table  Home 🔴 │  unchecked = dimmed (opacity 0.4)
│  ··· (scrollable)                │
│                                 │
│  ┌───────────────────────────┐  │
│  │  Import 13 words to Vault │  │  count updates reactively
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

---

## Architecture Summary — New Files

```
apps/mobile/src/app/
│
├── shared/
│   └── image/                                    ← NEW (LC-084)
│       ├── image-picker/
│       │   ├── image-picker.component.ts
│       │   ├── image-picker.component.html
│       │   └── image-picker.component.scss
│       └── image.model.ts
│
└── features/vault/import/
    ├── image-import-state.service.ts             ← NEW (LC-085)
    ├── services/
    │   └── image-import-api.service.ts           ← NEW (LC-086)
    └── pages/
        ├── image-import/                         ← NEW (LC-085) Screen I02
        │   ├── image-import.page.ts
        │   ├── image-import.page.html
        │   └── image-import.page.scss
        ├── image-processing/                     ← NEW (LC-086) Screen I03
        │   ├── image-processing.page.ts
        │   ├── image-processing.page.html
        │   └── image-processing.page.scss
        └── image-import-review/                  ← NEW (LC-087) Screen I04
            ├── image-import-review.page.ts
            ├── image-import-review.page.html
            └── image-import-review.page.scss

apps/api/src/
└── import/                                       ← NEW (LC-081/082/083)
    ├── import.module.ts
    ├── import.controller.ts
    ├── image-import.service.ts
    ├── image-import-prompt.builder.ts
    ├── image-validation.service.ts
    └── image-compression.service.ts

libs/shared/domain/src/
└── index.ts   ← add ImageExtractedWord, ImageImportRequest, ImageImportResult (LC-080)
```

---

## Dependency Chain

```
LC-080 (shared types) ─────────────────────────────────────────────────────┐
  └── LC-081 (API endpoint)                                                 │
        ├── LC-082 (image validation/compression)                           │
        └── LC-083 (prompt builder)                                         │
                                                                            │
LC-084 (shared image picker) ───────────────────────────────────────────── │
  └── LC-085 (image import page + state service)  ◀── also needs LC-080 ───┘
        └── LC-086 (processing page + API service) ◀── also needs LC-081
              └── LC-087 (review page)
                    ├── LC-089 (word selection polish)
                    ├── LC-091 (image thumbnail)
                    └── LC-092 (sync verification)
                          └── LC-093 (analytics)

LC-088 (extend existing import page)  ← parallel after LC-085
LC-090 (error states)                 ← parallel after LC-086
```

---

## Non-goals for this Epic

- OCR fallback if Gemini Vision fails — user sees error only
- Multi-image batch import in a single session
- User editing of AI-extracted word text before confirming (edit post-import via word-detail)
- Support for non-German target languages in this epic (architecture is language-agnostic but `contextId: 'german-vocab'` is hardcoded)
- AI confidence threshold auto-filtering (low-confidence words are flagged but never auto-removed)
- Image storage/history — images are not persisted after the import session
- Real-time streaming of word extraction results as Gemini processes
