# Epic: OpenRouter + Gemma 4 26B Integration
## Image → Cards & Story Generation via OpenRouter

> **Epic Number:** LC-094 (continuing from LC-093 image import analytics)
> **Feature Areas:** `apps/api/src/ai/providers/`, `apps/api/src/import/`, `apps/api/src/stories/`, `apps/api/src/config/`
> **Replaces:** Direct Gemini Vision calls in `image-import.service.ts`
> **Extends:** Story generation to use OpenRouter as configurable provider
> **Ticket numbers:** LC-094 through LC-102

---

## Research Summary — Is Gemma 4 26B Suitable for Story Generation?

Before committing to user stories, this question needs a direct answer.

### What the evidence shows

**Benchmark position:** Gemma 4 26B A4B placed 6th on Arena AI's text leaderboard with a score of 1441 — compared to Gemma 3 27B's 1365. That is a meaningful jump, not an incremental one. The 31B dense variant placed 3rd at 1452.

**Instruction following (IFBench):** The Artificial Analysis Intelligence Index, which includes IFBench as one of its 10 evaluations, shows the 26B A4B performing strongly on structured instruction-following tasks. For LinguaCard, every story and every image import is a structured JSON output task — the prompt is deterministic and constrained. This is where Gemma 4 is at its strongest.

**Multilingual:** Gemma 4 was trained natively on 140+ languages. German grammar generation, article conjugation (der/die/das), and CEFR-level text differentiation are all within scope.

**Agentic tool use:** τ2-bench jumped from 6.6% (Gemma 3 27B) to 86.4% (Gemma 4 31B), with the 26B MoE reaching similar levels. This matters for story generation because generating a story, then quizzes, then grammar notes as sequential prompts is effectively multi-step agentic behaviour.

**Known limitation:** One real-world tester noted the 26B MoE can lose coherence on very long tool-use chains. For LinguaCard story generation, this is mitigated by the fact that quiz, grammar notes, and keywords are already generated as independent `Promise.all()` calls, not a single chain. Each call is short and self-contained.

**Verdict for story generation: viable as a secondary provider, not a replacement for Anthropic.** The existing `textProvider` getter in `StoryGenerationService` already switches between Anthropic and Gemini via `AI_DEFAULT_PROVIDER`. Gemma 4 via OpenRouter slots into this same pattern as a third option. The recommendation is to use it as a **fallback** when Anthropic quota is exhausted, not as the default — because Anthropic (Claude Sonnet) produces demonstrably richer narrative prose and more reliable CEFR-level adherence. For image-to-cards, Gemma 4 is the **primary** because vision is the bottleneck and quality is equivalent.

---

## Epic Scope

| Problem | Current state | Target state |
|---|---|---|
| Image → cards hits 5–10 RPM Gemini limit | `ImageImportService` calls `GeminiAdapter.generateVision()` | Routes to `OpenRouterAdapter.generateVision()` using `google/gemma-4-26b-a4b-it:free` |
| Story generation exhausts Anthropic quota silently | `textProvider` only supports `anthropic` or `gemini` | Adds `openrouter` as a third valid provider for text generation |
| No rate-limit handling on vision calls | 429s crash the import flow | `OpenRouterAdapter` retries with exponential backoff; falls back to Gemini Flash-Lite |

---

## Story Map

| Phase | Ticket | Title | Points |
|---|---|---|---|
| 0 — Account | LC-094 | OpenRouter account setup & API key | 0 (manual, no code) |
| 1 — Config | LC-095 | Add `openrouter` provider to `AiConfig` and env | 1 |
| 1 — Adapter | LC-096 | `OpenRouterAdapter` — NestJS vision + text | 5 |
| 2 — Vision | LC-097 | Wire `ImageImportService` to `OpenRouterAdapter` | 3 |
| 2 — Vision | LC-098 | Fallback chain: OpenRouter → Gemini Flash-Lite | 2 |
| 3 — Stories | LC-099 | Add `openrouter` to `textProvider` in `StoryGenerationService` | 2 |
| 4 — Groq STT | LC-100 | `GroqWhisperAdapter` — replace OpenAI Whisper with Groq | 3 |
| 5 — Tests | LC-101 | Unit tests for `OpenRouterAdapter` | 2 |
| 6 — Deploy | LC-102 | Update `render.yaml` and `.env.example` with new keys | 1 |

**Total: 19 points**

---

---

## LC-094 · OpenRouter Account Setup (Manual — No Code)

**Epic:** OpenRouter + Gemma 4 Integration
**Phase:** 0 — Do this before any code
**Points:** 0 (ops task)

### Step-by-step account setup

Follow these steps exactly, in order.

#### Step 1 — Create the account

1. Go to **https://openrouter.ai**
2. Click **Sign In** → **Sign up with email**
3. Use a team/project email address (not personal) — this account will hold the API key used in production
4. Verify your email

#### Step 2 — Get your free API key

1. Once logged in, click your avatar (top-right) → **Keys**
2. Click **Create key**
3. Name it: `linguacard-api` (this name is for your reference only)
4. Leave **Credit limit** blank for now
5. Click **Create**
6. **Copy the key immediately** — it is shown only once. It starts with `sk-or-v1-...`
7. Save it somewhere secure (your password manager, not a notes app)

#### Step 3 — Verify free tier access

1. Still in the dashboard, go to **https://openrouter.ai/models?q=gemma-4-26b-a4b-it%3Afree**
2. You should see **Google: Gemma 4 26B A4B (free)** listed
3. The model ID you need is: `google/gemma-4-26b-a4b-it:free`
4. Check the **Context** column shows **256K tokens**

#### Step 4 — Deposit $10 (one-time, permanent quota upgrade)

> This is the single most impactful action. Without it: 50 req/day. With it: 1000 req/day — permanently.

1. Go to **https://openrouter.ai/credits**
2. Click **Add credits** → choose **$10**
3. Pay by card (this is a one-time charge, it never recurs automatically)
4. Confirm your credits balance shows at least $10.00

> **Why $10?** OpenRouter's pricing page confirms: once you have purchased at least $10 in credits, the daily limit for `:free` model requests increases from 50 to 1000 per day permanently. The $10 is never consumed by `:free` model calls — it stays in your balance for paid models. Effectively it is a permanent quota unlock, not a recurring cost.

#### Step 5 — Add the key to your local environment

Open `apps/api/.env` and add:

```
OPENROUTER_API_KEY=sk-or-v1-your-key-here
OPENROUTER_VISION_MODEL=google/gemma-4-26b-a4b-it:free
OPENROUTER_TEXT_MODEL=google/gemma-4-26b-a4b-it:free
```

Do **not** commit `.env`. Verify `.env` is in `.gitignore` (it already should be per LC-064).

#### Step 6 — Add the key to Render (production)

1. Go to **https://dashboard.render.com** → your `linguacard-api` service
2. Click **Environment** in the left sidebar
3. Add three new environment variables:
   - `OPENROUTER_API_KEY` → paste your key
   - `OPENROUTER_VISION_MODEL` → `google/gemma-4-26b-a4b-it:free`
   - `OPENROUTER_TEXT_MODEL` → `google/gemma-4-26b-a4b-it:free`
4. Click **Save changes** — Render will auto-redeploy

#### Step 7 — Verify the key works (manual test)

Run this curl from your terminal to confirm the key and model are active before writing any code:

```bash
curl https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer sk-or-v1-YOUR-KEY-HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemma-4-26b-a4b-it:free",
    "messages": [{"role": "user", "content": "Reply with: {\"ok\": true}"}],
    "max_tokens": 20
  }'
```

Expected response includes `"content": "{\"ok\": true}"`. If you see a 429, wait 60 seconds and retry (the free model can throttle on the first request after key creation).

---

---

## LC-095 · Add `openrouter` to `AiConfig` and env

**Epic:** OpenRouter + Gemma 4 Integration
**Phase:** 1 — Config (do before adapters)
**Points:** 1
**Depends on:** LC-094 (key must exist in `.env`)

### User story

As a developer, I want `openrouter` to be a valid AI provider in the NestJS config system, so that the `OpenRouterAdapter` can be registered and injected exactly like `GeminiAdapter` and `AnthropicAdapter` already are.

### Files to modify

| File | Change |
|---|---|
| `apps/api/src/config/ai.config.ts` | Add `openrouterApiKey`, `openrouterVisionModel`, `openrouterTextModel`; extend `defaultProvider` union |
| `apps/api/.env.example` | Add three new `OPENROUTER_*` placeholders |
| `render.yaml` | Add three new `OPENROUTER_*` env var entries |
| `libs/shared/domain/src/index.ts` | Extend `AIProviderType` to include `'openrouter'` |

### Implementation

```typescript
// apps/api/src/config/ai.config.ts
export interface AiConfig {
  anthropicApiKey: string;
  openaiApiKey: string;
  geminiApiKey: string;
  openrouterApiKey: string;        // ← new
  openrouterVisionModel: string;   // ← new  default: google/gemma-4-26b-a4b-it:free
  openrouterTextModel: string;     // ← new  default: google/gemma-4-26b-a4b-it:free
  defaultProvider: 'anthropic' | 'openai' | 'gemini' | 'openrouter'; // ← extended
  storageBucket: string;
}

export const aiConfig = (): { ai: AiConfig } => ({
  ai: {
    anthropicApiKey:      process.env['ANTHROPIC_API_KEY']         ?? '',
    openaiApiKey:         process.env['OPENAI_API_KEY']            ?? '',
    geminiApiKey:         process.env['GEMINI_API_KEY']            ?? '',
    openrouterApiKey:     process.env['OPENROUTER_API_KEY']        ?? '',
    openrouterVisionModel: process.env['OPENROUTER_VISION_MODEL']  ?? 'google/gemma-4-26b-a4b-it:free',
    openrouterTextModel:   process.env['OPENROUTER_TEXT_MODEL']    ?? 'google/gemma-4-26b-a4b-it:free',
    defaultProvider: (process.env['AI_DEFAULT_PROVIDER'] ?? 'gemini') as AiConfig['defaultProvider'],
    storageBucket:        process.env['AI_STORAGE_BUCKET']         ?? 'lingua-card-audio-dev',
  },
});
```

```typescript
// libs/shared/domain/src/index.ts — extend the union
export type AIProviderType = 'anthropic' | 'openai' | 'gemini' | 'openrouter';
```

```
# apps/api/.env.example — add these three lines in the AI providers section
OPENROUTER_API_KEY=                      # openrouter.ai → Keys → Create key
OPENROUTER_VISION_MODEL=google/gemma-4-26b-a4b-it:free
OPENROUTER_TEXT_MODEL=google/gemma-4-26b-a4b-it:free
```

```yaml
# render.yaml — add to envVars list
- key: OPENROUTER_API_KEY
  sync: false          # paste your sk-or-v1-... key in the Render dashboard
- key: OPENROUTER_VISION_MODEL
  value: google/gemma-4-26b-a4b-it:free
- key: OPENROUTER_TEXT_MODEL
  value: google/gemma-4-26b-a4b-it:free
```

### Acceptance criteria

- [ ] `AiConfig` compiles with the four new fields
- [ ] `AIProviderType` in shared domain includes `'openrouter'`
- [ ] `.env.example` has all three `OPENROUTER_*` placeholders
- [ ] `render.yaml` has the three new entries
- [ ] `tsc --noEmit` passes in `libs/shared/domain/`

---

---

## LC-096 · `OpenRouterAdapter` — NestJS vision + text

**Epic:** OpenRouter + Gemma 4 Integration
**Phase:** 1 — Adapter
**Points:** 5
**Depends on:** LC-095

### User story

As a developer, I want a NestJS `OpenRouterAdapter` that calls the OpenRouter API for both vision (image → JSON) and text generation tasks, so that `ImageImportService` and `StoryGenerationService` can use it without knowing the underlying provider.

### Files to create

| File | Purpose |
|---|---|
| `apps/api/src/ai/providers/openrouter.adapter.ts` | New adapter — OpenRouter API client |

### API details

OpenRouter uses the OpenAI-compatible API format:
- **Base URL:** `https://openrouter.ai/api/v1`
- **Auth:** `Authorization: Bearer <OPENROUTER_API_KEY>`
- **Required headers:** `HTTP-Referer: https://linguacard.app` and `X-Title: LinguaCard` (OpenRouter uses these for rate limit attribution)
- **Chat endpoint:** `POST /chat/completions` — same schema as OpenAI
- **Vision:** images are passed as `content` array items with `type: "image_url"` and `image_url.url` set to a base64 data URI

### Implementation

```typescript
// apps/api/src/ai/providers/openrouter.adapter.ts
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiConfig } from '../../config/ai.config';
import type { AITextRequest, AITextResponse } from './anthropic.adapter';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const APP_REFERER    = 'https://linguacard.app';
const APP_TITLE      = 'LinguaCard';

// Exponential backoff config
const MAX_RETRIES    = 3;
const BASE_DELAY_MS  = 1000;

@Injectable()
export class OpenRouterAdapter {
  private readonly logger  = new Logger(OpenRouterAdapter.name);
  private readonly apiKey:      string;
  private readonly visionModel: string;
  private readonly textModel:   string;

  constructor(private readonly config: ConfigService) {
    const ai = this.config.get<AiConfig>('ai')!;
    this.apiKey      = ai.openrouterApiKey;
    this.visionModel = ai.openrouterVisionModel;
    this.textModel   = ai.openrouterTextModel;
  }

  // ── Vision (image → text) ───────────────────────────────────────────────────

  async generateVision(opts: {
    imageBase64: string;
    mimeType: string;
    prompt: string;
    maxTokens?: number;
  }): Promise<string> {
    const body = {
      model: this.visionModel,
      max_tokens: opts.maxTokens ?? 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${opts.mimeType};base64,${opts.imageBase64}`,
              },
            },
            { type: 'text', text: opts.prompt },
          ],
        },
      ],
    };

    const raw = await this.callWithRetry('/chat/completions', body);
    return raw.choices?.[0]?.message?.content ?? '';
  }

  // ── Text generation ─────────────────────────────────────────────────────────

  async generateText(request: AITextRequest): Promise<AITextResponse> {
    const body = {
      model: this.textModel,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
      messages: request.messages,
    };

    const raw = await this.callWithRetry('/chat/completions', body);
    const text = raw.choices?.[0]?.message?.content ?? '';
    const usage = raw.usage ?? {};

    return {
      text,
      provider:     'openrouter' as const,
      model:        raw.model ?? this.textModel,
      inputTokens:  usage.prompt_tokens    ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async callWithRetry(path: string, body: unknown, attempt = 0): Promise<any> {
    const url = `${OPENROUTER_BASE}${path}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type':  'application/json',
          'HTTP-Referer':  APP_REFERER,
          'X-Title':       APP_TITLE,
        },
        body: JSON.stringify(body),
      });
    } catch (networkErr) {
      this.logger.error('OpenRouter network error', networkErr);
      throw new HttpException('AI service unreachable', HttpStatus.SERVICE_UNAVAILABLE);
    }

    // Rate limited — retry with exponential backoff
    if (res.status === 429) {
      if (attempt >= MAX_RETRIES) {
        this.logger.warn(`OpenRouter 429 — max retries (${MAX_RETRIES}) reached`);
        throw new HttpException(
          { message: 'AI quota exceeded. Please try again later.', retryAfterMs: 60_000 },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Honour Retry-After header if present
      const retryAfter = res.headers.get('Retry-After');
      const delayMs    = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : BASE_DELAY_MS * Math.pow(2, attempt);

      this.logger.warn(`OpenRouter 429 — retrying in ${delayMs}ms (attempt ${attempt + 1})`);
      await this.sleep(delayMs);
      return this.callWithRetry(path, body, attempt + 1);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`OpenRouter HTTP ${res.status}`, text);
      throw new HttpException('AI processing failed. Please try again.', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return res.json();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Register in `AiModule`

```typescript
// apps/api/src/ai/ai.module.ts
import { OpenRouterAdapter } from './providers/openrouter.adapter';

@Module({
  imports:     [forwardRef(() => WordAudioModule)],
  controllers: [AiController],
  providers:   [AnthropicAdapter, OpenAIAdapter, GeminiAdapter, OpenRouterAdapter, StorageService],
  exports:     [AnthropicAdapter, OpenAIAdapter, GeminiAdapter, OpenRouterAdapter, StorageService],
})
export class AiModule {}
```

### Acceptance criteria

- [ ] `OpenRouterAdapter` compiles with no TypeScript errors
- [ ] `generateVision()` sends base64 image as `data:` URI in the OpenAI messages format
- [ ] `generateText()` returns `AITextResponse` with correct provider `'openrouter'`
- [ ] 429 responses trigger up to 3 retries with exponential backoff
- [ ] 429 after max retries throws `HttpException` with status `TOO_MANY_REQUESTS`
- [ ] Network errors throw `HttpException` with status `SERVICE_UNAVAILABLE`
- [ ] `HTTP-Referer` and `X-Title` headers are sent on every request
- [ ] Adapter is exported from `AiModule`
- [ ] Unit test: `generateVision()` with mocked `fetch` returns the first choice's content string

---

---

## LC-097 · Wire `ImageImportService` to `OpenRouterAdapter`

**Epic:** OpenRouter + Gemma 4 Integration
**Phase:** 2 — Vision wiring
**Points:** 3
**Depends on:** LC-096

### User story

As a user, when I take a photo and import it as vocabulary cards, the system uses OpenRouter + Gemma 4 26B instead of Gemini Vision, so that I no longer hit the 5 RPM Gemini limit and imports complete successfully.

### Files to modify

| File | Change |
|---|---|
| `apps/api/src/import/image-import.service.ts` | Replace `GeminiAdapter` injection with `OpenRouterAdapter`; update `VISION_MODEL` constant |

### Implementation

```typescript
// apps/api/src/import/image-import.service.ts
import { OpenRouterAdapter } from '../ai/providers/openrouter.adapter';

// Change the constant to reflect the actual model used
const VISION_MODEL = 'google/gemma-4-26b-a4b-it:free';

@Injectable()
export class ImageImportService {
  private readonly logger = new Logger(ImageImportService.name);

  constructor(
    private readonly openRouter: OpenRouterAdapter,   // ← was: GeminiAdapter
    private readonly promptBuilder: ImageImportPromptBuilder,
  ) {}

  async extractWords(dto: ImageImportRequest): Promise<ImageImportResult> {
    const startMs = Date.now();
    const prompt  = this.promptBuilder.build(dto);

    let rawText: string;
    try {
      rawText = await this.openRouter.generateVision({
        imageBase64: dto.imageBase64,
        mimeType:    dto.mimeType,
        prompt,
        maxTokens:   4096,
      });
    } catch (err: unknown) {
      if (err instanceof HttpException) throw err;
      this.logger.error('OpenRouter vision call failed', err);
      throw new InternalServerErrorException('AI processing failed. Please try again.');
    }

    const words = this.parseResponse(rawText);

    if (words.length === 0) {
      throw new BadRequestException('No words detected in image');
    }

    return {
      words,
      totalFound:      words.length,
      imageDescription: '',
      processingMs:    Date.now() - startMs,
      modelUsed:       VISION_MODEL,
    };
  }

  // parseResponse(), parseArticle() — unchanged
}
```

### Update `ImportModule`

```typescript
// apps/api/src/import/import.module.ts
import { AiModule } from '../ai/ai.module';

@Module({
  imports:     [AiModule],   // AiModule already exports OpenRouterAdapter
  controllers: [ImportController],
  providers:   [ImageImportService, ImageImportPromptBuilder],
})
export class ImportModule {}
```

### Acceptance criteria

- [ ] `ImageImportService` no longer imports or injects `GeminiAdapter`
- [ ] `POST /import/image` returns a valid `ImageImportResult` when tested against a real photo
- [ ] `modelUsed` in the response equals `'google/gemma-4-26b-a4b-it:free'`
- [ ] A 429 from OpenRouter is re-thrown as `HttpException` (not swallowed as 500)
- [ ] Manual QA: import a photo of a German menu — at least 5 words extracted with correct articles

---

---

## LC-098 · Fallback chain: OpenRouter → Gemini Flash-Lite

**Epic:** OpenRouter + Gemma 4 Integration
**Phase:** 2 — Resilience
**Points:** 2
**Depends on:** LC-097

### User story

As a user, if OpenRouter is unavailable or rate-limited beyond retries, the image import still completes using Gemini Flash-Lite as a fallback, so that the feature never gives up entirely.

### Files to modify

| File | Change |
|---|---|
| `apps/api/src/import/image-import.service.ts` | Add fallback logic wrapping the OpenRouter call |
| `apps/api/src/ai/providers/gemini.adapter.ts` | Expose a `generateVisionLite()` method using `gemini-2.5-flash-lite` |

### Implementation

```typescript
// apps/api/src/ai/providers/gemini.adapter.ts — add this method
const VISION_LITE_MODEL = 'gemini-2.5-flash-lite';

async generateVisionLite(opts: {
  imageBase64: string;
  mimeType:    string;
  prompt:      string;
  maxTokens?:  number;
}): Promise<string> {
  // Identical to generateVision() but uses Flash-Lite model
  try {
    const response = await this.ai.models.generateContent({
      model: VISION_LITE_MODEL,
      contents: [
        {
          role:  'user',
          parts: [
            { inlineData: { mimeType: opts.mimeType, data: opts.imageBase64 } },
            { text: opts.prompt },
          ],
        },
      ],
      config: {
        maxOutputTokens: opts.maxTokens ?? 4096,
        thinkingConfig:  { thinkingBudget: 0 },
      },
    });
    return response.text ?? '';
  } catch (err: any) {
    if (err?.status === 429) {
      throw new HttpException(
        { message: 'AI quota exceeded. Please try again later.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    throw new InternalServerErrorException('AI processing failed. Please try again.');
  }
}
```

```typescript
// apps/api/src/import/image-import.service.ts — update extractWords()
constructor(
  private readonly openRouter: OpenRouterAdapter,
  private readonly gemini:     GeminiAdapter,       // ← re-add for fallback only
  private readonly promptBuilder: ImageImportPromptBuilder,
) {}

async extractWords(dto: ImageImportRequest): Promise<ImageImportResult> {
  const startMs = Date.now();
  const prompt  = this.promptBuilder.build(dto);
  const visionOpts = { imageBase64: dto.imageBase64, mimeType: dto.mimeType, prompt, maxTokens: 4096 };

  let rawText:    string;
  let modelUsed:  string;

  try {
    rawText   = await this.openRouter.generateVision(visionOpts);
    modelUsed = 'google/gemma-4-26b-a4b-it:free';
  } catch (primaryErr: unknown) {
    // Only fall back on quota errors — not on bad requests
    const status = (primaryErr as any)?.status;
    if (status !== 429 && status !== 503) throw primaryErr;

    this.logger.warn('OpenRouter vision unavailable — falling back to Gemini Flash-Lite');
    try {
      rawText   = await this.gemini.generateVisionLite(visionOpts);
      modelUsed = 'gemini-2.5-flash-lite';
    } catch (fallbackErr: unknown) {
      if (fallbackErr instanceof HttpException) throw fallbackErr;
      this.logger.error('Gemini fallback also failed', fallbackErr);
      throw new InternalServerErrorException('AI processing failed. Please try again.');
    }
  }

  const words = this.parseResponse(rawText);
  if (words.length === 0) throw new BadRequestException('No words detected in image');

  return {
    words,
    totalFound:       words.length,
    imageDescription: '',
    processingMs:     Date.now() - startMs,
    modelUsed,
  };
}
```

### Acceptance criteria

- [ ] When OpenRouter returns 429, the service retries internally (via `OpenRouterAdapter`), then falls through to Gemini Flash-Lite
- [ ] When OpenRouter returns 503, the service falls through to Gemini Flash-Lite immediately
- [ ] When Gemini Flash-Lite also fails, a clean 500 error is returned to the client
- [ ] `modelUsed` in the response correctly reflects which model actually ran
- [ ] A bad request (400 from OpenRouter) does NOT trigger the fallback — it is re-thrown directly
- [ ] Unit test: mock OpenRouter to throw 429, assert `generateVisionLite()` is called on Gemini

---

---

## LC-099 · Add `openrouter` to `textProvider` in `StoryGenerationService`

**Epic:** OpenRouter + Gemma 4 Integration
**Phase:** 3 — Story generation
**Points:** 2
**Depends on:** LC-096

### Context

The existing `textProvider` getter in `StoryGenerationService` switches between Anthropic and Gemini based on `AI_DEFAULT_PROVIDER`. This ticket adds `openrouter` as a valid third option so that Gemma 4 can be used for story text generation when Anthropic quota is exhausted or `AI_DEFAULT_PROVIDER=openrouter` is set in env.

**When to use OpenRouter for stories:** Gemma 4 26B produces grammatically valid German and follows structured JSON output reliably, but Anthropic (Claude Sonnet) produces richer narratives and more reliable CEFR-level adherence. The recommended config is to keep `AI_DEFAULT_PROVIDER=gemini` (or `anthropic`) in production and set `AI_DEFAULT_PROVIDER=openrouter` only in development or as an explicit fallback.

### Files to modify

| File | Change |
|---|---|
| `apps/api/src/stories/story-generation.service.ts` | Inject `OpenRouterAdapter`; add `'openrouter'` case to `textProvider` getter |

### Implementation

```typescript
// apps/api/src/stories/story-generation.service.ts
import { OpenRouterAdapter } from '../ai/providers/openrouter.adapter';

@Injectable()
export class StoryGenerationService {
  constructor(
    @InjectRepository(CardEntity)
    private readonly cardRepo:     Repository<CardEntity>,
    @InjectRepository(StoryEntity)
    private readonly storyRepo:    Repository<StoryEntity>,
    private readonly promptBuilder: StoryPromptBuilder,
    private readonly anthropic:     AnthropicAdapter,
    private readonly gemini:        GeminiAdapter,
    private readonly openRouter:    OpenRouterAdapter,    // ← new injection
    private readonly config:        ConfigService,
    private readonly audioService:  StoryAudioService,
    private readonly vocabMapper:   StoryVocabMapper,
  ) {}

  private get textProvider(): {
    generateText(r: AITextRequest): Promise<{ text: string; model: string; inputTokens: number; outputTokens: number }>;
  } {
    const provider = this.config.get<AiConfig>('ai')!.defaultProvider;
    switch (provider) {
      case 'openrouter': return this.openRouter;   // ← new case
      case 'gemini':     return this.gemini;
      default:           return this.anthropic;
    }
  }

  // All other methods unchanged — they call this.textProvider.generateText()
}
```

### `StoriesModule` update

```typescript
// apps/api/src/stories/stories.module.ts
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [TypeOrmModule.forFeature([StoryEntity, CardEntity]), AiModule],
  // ...
})
export class StoriesModule {}
```

### Acceptance criteria

- [ ] Setting `AI_DEFAULT_PROVIDER=openrouter` in `.env` causes story text to be generated via `OpenRouterAdapter`
- [ ] The `textProvider` getter has no fallback side effects — it simply routes to the correct adapter
- [ ] Story generation still works when `AI_DEFAULT_PROVIDER` is `gemini` or `anthropic`
- [ ] `response.model` in story generation logs correctly shows the OpenRouter model name when routing via `openrouter`
- [ ] Manual QA with `AI_DEFAULT_PROVIDER=openrouter`: generate a B1-level story — confirm correct JSON shape and valid German grammar

---

---

## LC-100 · `GroqWhisperAdapter` — replace OpenAI Whisper with Groq

**Epic:** OpenRouter + Gemma 4 Integration
**Phase:** 4 — Karaoke timestamps
**Points:** 3
**Depends on:** LC-095 (config pattern established)

### Context

The current pipeline uses OpenAI Whisper (`whisper-1`) for word-level timestamps that power karaoke highlighting in the story reader. This is a paid call. Groq offers Whisper Large V3 Turbo at **free tier** (2,000 requests/day, 7,200 audio-seconds/hour) with the same `timestamp_granularities: ["word"]` parameter and identical response shape. German (`de`) is in Groq's supported language list. The endpoint is OpenAI-compatible at `https://api.groq.com/openai/v1`. The change is a drop-in replacement — no downstream code changes required.

### Account setup for Groq (manual, no points)

1. Go to **https://console.groq.com**
2. Sign up with email
3. Go to **API Keys** → **Create API Key**
4. Name it `linguacard-api`
5. Copy the key (starts with `gsk_...`)
6. Add to `apps/api/.env`:
   ```
   GROQ_API_KEY=gsk_your-key-here
   ```
7. Add to Render dashboard under Environment Variables

### Files to create / modify

| File | Change |
|---|---|
| `apps/api/src/ai/providers/groq-whisper.adapter.ts` | New — Groq STT adapter |
| `apps/api/src/ai/ai.module.ts` | Register `GroqWhisperAdapter` |
| `apps/api/src/stories/story-audio.service.ts` | Inject `GroqWhisperAdapter`; replace `OpenAIAdapter` for transcription |
| `apps/api/src/config/ai.config.ts` | Add `groqApiKey` field |
| `apps/api/.env.example` | Add `GROQ_API_KEY` placeholder |
| `render.yaml` | Add `GROQ_API_KEY` env var entry |

### Implementation

```typescript
// apps/api/src/ai/providers/groq-whisper.adapter.ts
import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WordTimestamp } from '@lingua-card/shared/domain';
import type { AiConfig } from '../../config/ai.config';

const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_MODEL   = 'whisper-large-v3-turbo';

@Injectable()
export class GroqWhisperAdapter {
  private readonly logger = new Logger(GroqWhisperAdapter.name);
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<AiConfig>('ai')!.groqApiKey;
  }

  async transcribeWithTimestamps(
    audioBuffer: ArrayBuffer,
    mimeType = 'audio/wav',
  ): Promise<WordTimestamp[]> {
    if (!this.apiKey) {
      this.logger.warn('GROQ_API_KEY not configured — karaoke timestamps unavailable');
      return [];
    }

    const ext = mimeType.includes('mp3') ? 'audio.mp3' : 'audio.wav';
    const blob = new Blob([audioBuffer], { type: mimeType });

    const form = new FormData();
    form.append('file', blob, ext);
    form.append('model', GROQ_MODEL);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    form.append('language', 'de');   // explicit German — improves accuracy

    let res: Response;
    try {
      res = await fetch(GROQ_STT_URL, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        body:    form,
      });
    } catch (networkErr) {
      this.logger.error('Groq Whisper network error', networkErr);
      return [];  // timestamps are optional — don't block story save
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`Groq Whisper HTTP ${res.status}`, text);
      return [];
    }

    const data = await res.json();

    return ((data.words ?? []) as Array<{ word: string; start: number; end: number }>).map(w => ({
      word:    w.word.trim(),
      startMs: Math.round(w.start * 1000),
      endMs:   Math.round(w.end   * 1000),
      isVocab: false,
      cardId:  undefined,
    }));
  }
}
```

```typescript
// apps/api/src/stories/story-audio.service.ts — update injection
import { GroqWhisperAdapter } from '../ai/providers/groq-whisper.adapter';

@Injectable()
export class StoryAudioService {
  constructor(
    private readonly gemini:       GeminiAdapter,
    private readonly groqWhisper:  GroqWhisperAdapter,    // ← replaces OpenAIAdapter for STT
    private readonly storage:      StorageService,
  ) {}

  async generateAudioWithTimestamps(
    storyText: string,
    storyId:   string,
  ): Promise<{ audioUrl: string | null; timestamps: WordTimestamp[]; durationMs: number }> {
    // TTS — unchanged, still uses Gemini
    let audioBuffer: ArrayBuffer;
    let durationMs:  number;
    let mimeType:    string;

    try {
      const speech = await this.gemini.generateSpeech({ text: storyText, language: 'de-DE' });
      audioBuffer  = speech.audioBuffer;
      durationMs   = speech.durationMs;
      mimeType     = speech.mimeType;
    } catch (err) {
      this.logger.error(`Gemini TTS failed for story ${storyId}`, err);
      return { audioUrl: null, timestamps: [], durationMs: 0 };
    }

    const ext         = mimeType.includes('mp3') ? 'mp3' : 'wav';
    const contentType = mimeType.includes('mp3') ? 'audio/mpeg' : 'audio/wav';
    const audioUrl    = await this.storage.upload(
      Buffer.from(audioBuffer), `stories/${storyId}.${ext}`, contentType,
    );

    // Whisper timestamps — now uses Groq (free) instead of OpenAI (paid)
    let timestamps: WordTimestamp[];
    try {
      timestamps = await this.groqWhisper.transcribeWithTimestamps(audioBuffer, mimeType);
    } catch (err) {
      this.logger.error(`Groq Whisper failed for story ${storyId}`, err);
      timestamps = [];
    }

    return { audioUrl, timestamps, durationMs };
  }
}
```

```typescript
// apps/api/src/config/ai.config.ts — add groqApiKey
export interface AiConfig {
  // ... existing fields
  groqApiKey: string;  // ← new
}

export const aiConfig = (): { ai: AiConfig } => ({
  ai: {
    // ... existing fields
    groqApiKey: process.env['GROQ_API_KEY'] ?? '',
  },
});
```

### Acceptance criteria

- [ ] `GroqWhisperAdapter` compiles and is registered in `AiModule`
- [ ] `transcribeWithTimestamps()` returns `WordTimestamp[]` with `startMs` and `endMs` populated
- [ ] If `GROQ_API_KEY` is not set, returns `[]` gracefully (does not throw)
- [ ] Network errors return `[]` without blocking story save
- [ ] `language: 'de'` is explicitly sent to Groq for German accuracy
- [ ] `StoryAudioService` no longer imports or injects `OpenAIAdapter` for transcription
- [ ] Manual QA: generate a story — confirm karaoke highlighting works in the reader

---

---

## LC-101 · Unit tests for `OpenRouterAdapter`

**Epic:** OpenRouter + Gemma 4 Integration
**Phase:** 5 — Tests
**Points:** 2
**Depends on:** LC-096

### Files to create

| File | Purpose |
|---|---|
| `apps/api/src/ai/providers/openrouter.adapter.spec.ts` | Unit tests |

### Test cases

```typescript
// apps/api/src/ai/providers/openrouter.adapter.spec.ts

describe('OpenRouterAdapter', () => {

  describe('generateVision()', () => {
    it('returns text from the first choice', async () => { /* ... */ });
    it('sends base64 image as data: URI in messages array', async () => { /* ... */ });
    it('includes HTTP-Referer and X-Title headers', async () => { /* ... */ });
    it('retries up to 3 times on 429 before throwing', async () => { /* ... */ });
    it('throws HttpException with TOO_MANY_REQUESTS after max retries', async () => { /* ... */ });
    it('throws SERVICE_UNAVAILABLE on network error', async () => { /* ... */ });
  });

  describe('generateText()', () => {
    it('returns AITextResponse with provider openrouter', async () => { /* ... */ });
    it('maps usage.prompt_tokens to inputTokens', async () => { /* ... */ });
    it('maps usage.completion_tokens to outputTokens', async () => { /* ... */ });
  });

  describe('callWithRetry()', () => {
    it('delays exponentially between retries (1s, 2s, 4s)', async () => { /* ... */ });
    it('respects Retry-After header when present', async () => { /* ... */ });
    it('does not retry on 400 or 500 errors', async () => { /* ... */ });
  });
});
```

### Acceptance criteria

- [ ] All 11 test cases pass
- [ ] Tests use `jest.spyOn(global, 'fetch')` to mock the HTTP layer — no real network calls
- [ ] `jest --coverage` shows ≥ 90% branch coverage on `openrouter.adapter.ts`

---

---

## LC-102 · Update `render.yaml` and `.env.example`

**Epic:** OpenRouter + Gemma 4 Integration
**Phase:** 6 — Deploy
**Points:** 1
**Depends on:** LC-095, LC-100

### Files to modify

| File | Change |
|---|---|
| `render.yaml` | Add `OPENROUTER_API_KEY`, `OPENROUTER_VISION_MODEL`, `OPENROUTER_TEXT_MODEL`, `GROQ_API_KEY` |
| `apps/api/.env.example` | Same four keys with comments |

### Final `.env.example` AI section

```bash
# ── AI providers ──────────────────────────────────────────────────────────────
GEMINI_API_KEY=                           # aistudio.google.com — used for TTS
ANTHROPIC_API_KEY=                        # optional — story generation (highest quality)
OPENAI_API_KEY=                           # deprecated — Whisper replaced by Groq
AI_DEFAULT_PROVIDER=gemini                # gemini | anthropic | openrouter

# ── OpenRouter (image → cards + optional story generation) ───────────────────
OPENROUTER_API_KEY=                       # openrouter.ai → Keys → Create key (starts sk-or-v1-)
OPENROUTER_VISION_MODEL=google/gemma-4-26b-a4b-it:free
OPENROUTER_TEXT_MODEL=google/gemma-4-26b-a4b-it:free

# ── Groq (Whisper STT — karaoke timestamps, free tier) ───────────────────────
GROQ_API_KEY=                             # console.groq.com → API Keys (starts gsk_)
```

### Final `render.yaml` AI section

```yaml
# ── AI providers ─────────────────────────────────────────────────────────────
- key: GEMINI_API_KEY
  sync: false
- key: ANTHROPIC_API_KEY
  sync: false
- key: AI_DEFAULT_PROVIDER
  value: gemini
# ── OpenRouter ────────────────────────────────────────────────────────────────
- key: OPENROUTER_API_KEY
  sync: false
- key: OPENROUTER_VISION_MODEL
  value: google/gemma-4-26b-a4b-it:free
- key: OPENROUTER_TEXT_MODEL
  value: google/gemma-4-26b-a4b-it:free
# ── Groq Whisper ──────────────────────────────────────────────────────────────
- key: GROQ_API_KEY
  sync: false
```

### Acceptance criteria

- [ ] `render.yaml` has all four new keys
- [ ] `.env.example` has all four new keys with clear comments
- [ ] `OPENAI_API_KEY` is marked deprecated in `.env.example` (not removed — still in code path)
- [ ] Manual verification: deploy to Render staging with all keys set → import an image → story karaoke works

---

---

## Dependency Chain

```
LC-094 (account setup — manual)
  └── LC-095 (AiConfig + env)
        └── LC-096 (OpenRouterAdapter)
              ├── LC-097 (wire ImageImportService) → LC-098 (fallback chain)
              ├── LC-099 (wire StoryGenerationService)
              └── LC-101 (unit tests)
  └── LC-100 (GroqWhisperAdapter) — parallel with LC-096
LC-102 (render.yaml + .env.example) — final, after all above
```

---

## Implementation Order

Work through these in exactly this sequence:

1. **LC-094** — Account setup (manual). Do this first — nothing works without the key.
2. **LC-095** — Config changes. One-liner additions to `ai.config.ts` and env files.
3. **LC-096** — `OpenRouterAdapter`. The core new file. ~120 lines.
4. **LC-100** — `GroqWhisperAdapter`. Independent of LC-097–099, can be done in parallel.
5. **LC-097** — Wire `ImageImportService`. Swap one injection.
6. **LC-099** — Wire `StoryGenerationService`. Add one case to the switch.
7. **LC-098** — Fallback chain. Adds resilience on top of LC-097.
8. **LC-101** — Unit tests. Write after adapters are stable.
9. **LC-102** — Deploy config. Last step before pushing to production.

---

## Non-goals for this Epic

- Switching the default story provider to OpenRouter in production (keep Anthropic as default)
- Building any UI to select AI provider
- Caching OpenRouter responses (rate limit is generous enough at 1000 req/day)
- Using Groq for TTS (Groq TTS is English/Arabic only — German not supported)
- Removing the Gemini vision adapter (it stays as fallback in LC-098)
- Fine-tuning Gemma 4 on LinguaCard vocabulary (out of scope)

---

## Rate Limit Reference Card

| Provider | Use | Free RPM | Free RPD | Notes |
|---|---|---|---|---|
| OpenRouter (Gemma 4 free) | Vision + text | 20 | 1000* | *requires $10 one-time deposit |
| Gemini 2.5 Flash-Lite | Vision fallback | 15 | 1000 | existing key |
| Groq Whisper Large V3 Turbo | STT timestamps | — | 2000 req / 7200 audio-sec/hr | new key required |
| Gemini 2.5 Flash TTS | Audio generation | 3 | 15 | unchanged — TTS bottleneck unchanged |

> **Note on TTS:** The Gemini TTS rate limit (3 RPM) is out of scope for this epic. It is a separate problem requiring either a dedicated TTS caching layer or upgrade to paid tier. This epic does not change TTS behaviour.
