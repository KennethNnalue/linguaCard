# Epic: Tiered AI Provider Routing
## Gemini Flash for Vision · Haiku for Enrichment · Sonnet (Pro) / Gemini Flash (Free) for Stories

> **Epic Number:** LC-119 (continuing from LC-118 subscription tests)
> **Feature Areas:**
> - `apps/api/src/config/ai.config.ts` — new per-task model config fields
> - `apps/api/src/ai/providers/openrouter.adapter.ts` — model override support
> - `apps/api/src/import/image-import.service.ts` — direct Gemini for vision
> - `apps/api/src/import/word-enrich.service.ts` — Haiku via OpenRouter for enrichment
> - `apps/api/src/import/image-extract.service.ts` — direct Gemini for Phase 1 extraction
> - `apps/api/src/stories/story-generation.service.ts` — tier-aware Sonnet / Gemini Flash
> - `apps/api/.env.example` — new model env vars
> - `render.yaml` — new env var entries
>
> **Ticket numbers:** LC-119 through LC-128
>
> **Depends on:** LC-103–118 (Subscription epic) — specifically `SubscriptionService.getEffectiveTier()`

---

## Context & Current State

### What exists today

| Service | Current provider | Problem |
|---|---|---|
| `ImageImportService` (legacy single-pass) | OpenRouter → Gemma 4 26B free | Good for vision — keep |
| `ImageExtractService` (Phase 1 extract) | OpenRouter → Gemma 4 26B free | Should use direct Gemini Flash for best OCR |
| `WordEnrichService` (Phase 2 enrich) | OpenRouter → Gemma 4 26B free | JSON reliability issues — switch to Haiku |
| `StoryGenerationService` | Reads `AI_DEFAULT_PROVIDER` env var | Single env var for all users — no tier awareness |

### What this epic builds

```
TASK                    PROVIDER               MODEL                          COST / CALL
─────────────────────────────────────────────────────────────────────────────────────────
Image extraction        Google (direct)        gemini-2.5-flash               ~$0.001
Word enrichment         OpenRouter → Anthropic  anthropic/claude-haiku-4-5    ~$0.005
Story — Pro user        OpenRouter → Anthropic  anthropic/claude-sonnet-4-6   ~$0.093
Story — Free user       OpenRouter → Google     google/gemini-2.5-flash       ~$0.015
Story quiz/grammar/kw   (same provider as story, cheaper secondary calls)
─────────────────────────────────────────────────────────────────────────────────────────
```

### Why OpenRouter for enrichment and stories (not direct Anthropic)?

- **One API key** covers both Haiku and Sonnet — single credit balance, unified dashboard, no separate Anthropic key rotation
- **The `OpenRouterAdapter` already exists** and is fully tested (LC-096–101) — model switching is just a string change
- **Built-in failover** — if Anthropic's endpoint is degraded, OpenRouter automatically routes to backup providers
- **Direct Gemini API** is used for vision because Gemini's native API handles multimodal images better than the OpenRouter passthrough, and the existing `GeminiAdapter.generateVision()` already handles the rate-limit token bucket and fallback to Flash-Lite

### Model strings via OpenRouter

| Model | OpenRouter string |
|---|---|
| Claude Haiku 4.5 | `anthropic/claude-haiku-4-5` |
| Claude Sonnet 4.6 | `anthropic/claude-sonnet-4-6` |
| Gemini 2.5 Flash | `google/gemini-2.5-flash` |

---

## Architecture After This Epic

```
IMAGE SCAN (POST /import/image/extract)
  ImageExtractService
    → GeminiAdapter.generateVision()           ← Direct Gemini API (existing)
      model: gemini-2.5-flash (via GEMINI_API_KEY)

WORD ENRICHMENT (POST /import/enrich)
  WordEnrichService
    → OpenRouterAdapter.generateText()          ← Model override: Haiku
      model: anthropic/claude-haiku-4-5
      (was: google/gemma-4-26b-a4b-it:free)

STORY GENERATION (POST /stories/generate)
  StoryGenerationService
    SubscriptionService.getEffectiveTier(userId)
      tier === 'pro'  → OpenRouterAdapter.generateText()   model: anthropic/claude-sonnet-4-6
      tier === 'free' → OpenRouterAdapter.generateText()   model: google/gemini-2.5-flash
    (quiz, grammar, keywords use the same provider as the main story)
```

---

## What Does NOT Change

- `ImageImportService` (legacy single-pass) — still uses OpenRouter + Gemma 4 free. Not the primary path; kept for backwards compatibility.
- `OpenRouterAdapter` structure — no new methods. Only a new optional `modelOverride` parameter added to `generateText()`.
- `GeminiAdapter` — no changes. Direct vision call path is already correct.
- TTS, Whisper, Google Cloud TTS — completely out of scope.
- Angular app — no changes. All routing is server-side.

---

## Story Map

| Phase | Ticket  | Title                                                               | Points |
|-------|---------|---------------------------------------------------------------------|--------|
| 0 — Config | LC-119 | Add per-task model config fields to `AiConfig` and env         | 2      |
| 1 — Adapter | LC-120 | Add `modelOverride` to `OpenRouterAdapter.generateText()`      | 2      |
| 2 — Enrich  | LC-121 | Switch `WordEnrichService` to Claude Haiku via OpenRouter      | 2      |
| 2 — Extract | LC-122 | Confirm `ImageExtractService` uses direct Gemini (audit + test)| 1      |
| 3 — Stories | LC-123 | Tier-aware `textProviderForTier()` in `StoryGenerationService` | 3      |
| 3 — Stories | LC-124 | Pass tier through all story sub-generators (quiz/grammar/kw)   | 2      |
| 4 — Deploy  | LC-125 | Update `.env.example` and `render.yaml`                        | 1      |
| 5 — Tests   | LC-126 | Unit tests for tier routing in `StoryGenerationService`        | 2      |
| 5 — Tests   | LC-127 | Integration smoke test: free story → Gemini, pro story → Sonnet| 2      |
| 6 — Docs    | LC-128 | Update `CLAUDE.md` epic table and `.env.example` comments      | 1      |

**Total: 18 points**

---

---

## LC-119 · Add per-task model config fields to `AiConfig` and env

**Epic:** Tiered AI Routing
**Phase:** 0 — Do this first (unblocks everything)
**Points:** 2
**Depends on:** nothing (extends existing `AiConfig`)

### User story

As a developer, I want each AI task (enrichment, story-pro, story-free) to have its own configurable model string in `AiConfig`, so that switching models in production requires only an env var change and never a code deploy.

### Context

`AiConfig` currently has `openrouterTextModel` which is a single model string used for all OpenRouter text calls. This ticket splits that into three task-specific fields, while keeping the original `openrouterTextModel` as a fallback default.

### Files to modify

| File | Change |
|---|---|
| `apps/api/src/config/ai.config.ts` | Add three new model fields |
| `apps/api/.env.example` | Add three new env var comments |
| `render.yaml` | Add three new env var entries |

### Implementation

```typescript
// apps/api/src/config/ai.config.ts

export interface AiConfig {
  anthropicApiKey:           string;
  openaiApiKey:              string;
  geminiApiKey:              string;
  openrouterApiKey:          string;
  openrouterVisionModel:     string;   // existing — Gemma 4 free for legacy single-pass
  openrouterTextModel:       string;   // existing — generic fallback
  // ── New per-task model fields ───────────────────────────────────────────────
  enrichmentModel:           string;   // model used for word enrichment (POST /import/enrich)
  storyModelPro:             string;   // model used for stories when user is Pro tier
  storyModelFree:            string;   // model used for stories when user is Free tier
  // ────────────────────────────────────────────────────────────────────────────
  groqApiKey:                string;
  defaultProvider:           'anthropic' | 'openai' | 'gemini' | 'openrouter';
  storageBucket:             string;
  googleCloudTtsKeyBase64:   string;
  googleCloudTtsVoice:       string;
  googleCloudTtsLanguage:    string;
}

export const aiConfig = (): { ai: AiConfig } => ({
  ai: {
    anthropicApiKey:      process.env['ANTHROPIC_API_KEY']        ?? '',
    openaiApiKey:         process.env['OPENAI_API_KEY']           ?? '',
    geminiApiKey:         process.env['GEMINI_API_KEY']           ?? '',
    openrouterApiKey:     process.env['OPENROUTER_API_KEY']       ?? '',
    openrouterVisionModel: process.env['OPENROUTER_VISION_MODEL'] ?? 'google/gemma-4-26b-a4b-it:free',
    openrouterTextModel:   process.env['OPENROUTER_TEXT_MODEL']   ?? 'google/gemma-4-26b-a4b-it:free',

    // Per-task model strings — override individually without touching other tasks
    enrichmentModel:  process.env['ENRICHMENT_MODEL']   ?? 'anthropic/claude-haiku-4-5',
    storyModelPro:    process.env['STORY_MODEL_PRO']    ?? 'anthropic/claude-sonnet-4-6',
    storyModelFree:   process.env['STORY_MODEL_FREE']   ?? 'google/gemini-2.5-flash',

    groqApiKey:           process.env['GROQ_API_KEY']             ?? '',
    defaultProvider: (process.env['AI_DEFAULT_PROVIDER'] ?? 'gemini') as AiConfig['defaultProvider'],
    storageBucket:        process.env['AI_STORAGE_BUCKET']        ?? 'lingua-card-audio-dev',
    googleCloudTtsKeyBase64: process.env['GOOGLE_CLOUD_TTS_KEY_BASE64'] ?? '',
    googleCloudTtsVoice:     process.env['GOOGLE_CLOUD_TTS_VOICE']      ?? 'de-DE-Wavenet-B',
    googleCloudTtsLanguage:  process.env['GOOGLE_CLOUD_TTS_LANGUAGE']   ?? 'de-DE',
  },
});
```

### `.env.example` additions (add in the AI providers section)

```bash
# ── Per-task AI model routing ─────────────────────────────────────────────────
# These control which model handles each specific task.
# All three use the OPENROUTER_API_KEY for billing (one key, one invoice).
# Change these to swap models without any code changes.

# Word enrichment (translation + article + example sentences per card)
# Haiku: best JSON reliability, fast, $1/$5 per million tokens
ENRICHMENT_MODEL=anthropic/claude-haiku-4-5

# Story generation for Pro subscribers
# Sonnet: best German narrative quality, CEFR adherence, $3/$15 per million tokens
STORY_MODEL_PRO=anthropic/claude-sonnet-4-6

# Story generation for Free tier users
# Gemini Flash: good quality at A1-B1, $0.30/$2.50 per million tokens (~6x cheaper)
STORY_MODEL_FREE=google/gemini-2.5-flash
```

### `render.yaml` additions

```yaml
- key: ENRICHMENT_MODEL
  value: anthropic/claude-haiku-4-5
- key: STORY_MODEL_PRO
  value: anthropic/claude-sonnet-4-6
- key: STORY_MODEL_FREE
  value: google/gemini-2.5-flash
```

### Acceptance criteria

- [ ] `AiConfig` interface has `enrichmentModel`, `storyModelPro`, `storyModelFree`
- [ ] All three default to the correct OpenRouter model strings when env vars are not set
- [ ] `.env.example` documents all three vars with cost context in comments
- [ ] `render.yaml` has three new entries with correct default values
- [ ] `tsc --noEmit` passes across all packages
- [ ] No existing behaviour changes — this ticket only adds config; no runtime code changes

---

---

## LC-120 · Add `modelOverride` to `OpenRouterAdapter.generateText()`

**Epic:** Tiered AI Routing
**Phase:** 1 — Adapter
**Points:** 2
**Depends on:** LC-119

### User story

As a developer, I want to pass an optional model override to `OpenRouterAdapter.generateText()`, so that `WordEnrichService` and `StoryGenerationService` can each use a different model through the same adapter without instantiating separate adapters.

### Context

Currently `OpenRouterAdapter.generateText()` always uses `this.textModel` (from `OPENROUTER_TEXT_MODEL` env var). We need to support per-call model overrides while keeping backwards compatibility — callers that don't pass a model still use the configured default.

### Files to modify

| File | Change |
|---|---|
| `apps/api/src/ai/providers/openrouter.adapter.ts` | Add optional `model?` field to `AITextRequest` interface usage |

### Implementation

The `AITextRequest` interface is defined in `anthropic.adapter.ts`. We extend the call signature in `OpenRouterAdapter` without changing the shared interface (to avoid breaking the Anthropic adapter):

```typescript
// apps/api/src/ai/providers/openrouter.adapter.ts

// Add this local interface — extends AITextRequest with an optional model override
interface OpenRouterTextRequest {
  messages:     AITextRequest['messages'];
  maxTokens?:   number;
  temperature?: number;
  model?:       string;   // ← new: if provided, overrides this.textModel for this call only
}

@Injectable()
export class OpenRouterAdapter {
  // ... constructor and generateVision() unchanged ...

  // Updated signature — accepts the extended request type
  async generateText(request: OpenRouterTextRequest): Promise<AITextResponse> {
    const modelToUse = request.model ?? this.textModel;   // ← use override if provided

    const body = {
      model:       modelToUse,
      max_tokens:  request.maxTokens  ?? 4096,
      temperature: request.temperature ?? 0.7,
      messages:    request.messages,
    };

    const raw   = await this.callWithRetry('/chat/completions', body);
    const text  = (raw?.choices?.[0]?.message?.content as string | undefined) ?? '';
    const usage = (raw?.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined) ?? {};

    return {
      text,
      model:        (raw?.model as string | undefined) ?? modelToUse,
      inputTokens:  usage.prompt_tokens    ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
    };
  }

  // callWithRetry(), sleep() — unchanged
}
```

### Backwards compatibility

All existing callers (`WordEnrichService`, `StoryGenerationService`) that call `openRouter.generateText({ messages, maxTokens })` without a `model` field continue to work identically — they fall through to `this.textModel` (the `OPENROUTER_TEXT_MODEL` env var).

### Acceptance criteria

- [ ] `generateText({ messages, model: 'anthropic/claude-haiku-4-5' })` uses Haiku, not `this.textModel`
- [ ] `generateText({ messages })` (no model override) still uses `this.textModel` — no regression
- [ ] `response.model` in the return value reflects the actually-used model (from the API response)
- [ ] `tsc --noEmit` passes — the local `OpenRouterTextRequest` interface is a superset of `AITextRequest`
- [ ] Unit test: calling `generateText()` with a model override passes that model in the request body

---

---

## LC-121 · Switch `WordEnrichService` to Claude Haiku via OpenRouter

**Epic:** Tiered AI Routing
**Phase:** 2 — Enrichment
**Points:** 2
**Depends on:** LC-119, LC-120

### User story

As a developer, I want word enrichment to use Claude Haiku 4.5 via OpenRouter, replacing Gemma 4 26B free, so that translations, articles (der/die/das), and example sentences are generated with higher JSON reliability and better German grammar quality.

### Context

`WordEnrichService` currently calls:
```typescript
await this.openRouter.generateText({ messages: [...], maxTokens: 2048 })
```
This uses `OPENROUTER_TEXT_MODEL` which defaults to `google/gemma-4-26b-a4b-it:free`.

After this ticket it will pass the `enrichmentModel` from `AiConfig` as the model override.

### Why Haiku over Gemma for enrichment?

Enrichment produces structured JSON with exact field requirements (`front`, `back`, `article`, `categoryName`, `exampleTarget`, `exampleNative`). Gemma 4 occasionally drifts from the schema or produces malformed JSON requiring extra recovery. Haiku has near-perfect JSON adherence and produces better German example sentences. At ~$0.005 per import batch (10 words), the cost difference is negligible.

### Files to modify

| File | Change |
|---|---|
| `apps/api/src/import/word-enrich.service.ts` | Inject `ConfigService`; pass `enrichmentModel` as model override |

### Implementation

```typescript
// apps/api/src/import/word-enrich.service.ts

import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiConfig } from '../config/ai.config';
import type {
  EnrichWordsRequest,
  EnrichWordsResult,
  ImageExtractedWord,
  RawExtractedWord,
} from '@lingua-card/shared/domain';
import { OpenRouterAdapter } from '../ai/providers/openrouter.adapter';
import { WordEnrichPromptBuilder } from './word-enrich-prompt.builder';
import { recoverJsonArray } from './json-recovery.util';

const DEFAULT_BATCH_SIZE    = 10;
const INTER_BATCH_DELAY_MS  = 3_500;

@Injectable()
export class WordEnrichService {
  private readonly logger         = new Logger(WordEnrichService.name);
  private readonly enrichmentModel: string;

  constructor(
    private readonly openRouter:    OpenRouterAdapter,
    private readonly promptBuilder: WordEnrichPromptBuilder,
    private readonly config:        ConfigService,           // ← new injection
  ) {
    // Read once at construction — model string never changes at runtime
    this.enrichmentModel = this.config.get<AiConfig>('ai')!.enrichmentModel;
    this.logger.log(`Enrichment model: ${this.enrichmentModel}`);
  }

  async enrichWords(dto: EnrichWordsRequest): Promise<EnrichWordsResult> {
    // ... existing loop logic unchanged ...
  }

  private async enrichBatch(
    words: RawExtractedWord[],
    targetLanguage: string,
    nativeLanguage: string,
  ): Promise<ImageExtractedWord[]> {
    const prompt = this.promptBuilder.build(words, targetLanguage, nativeLanguage);

    const result = await this.openRouter.generateText({
      messages:  [{ role: 'user', content: prompt }],
      maxTokens: 2048,
      model:     this.enrichmentModel,   // ← NOW passes Haiku model string
    });

    return this.parseEnrichmentResponse(result.text);
  }

  // parseEnrichmentResponse(), chunk(), sleep() — unchanged
}
```

### Module update — `ImportModule` already imports `AiModule`

`ConfigService` is globally available via `ConfigModule.forRoot()` in `AppModule` — no additional import needed in `ImportModule`.

### Acceptance criteria

- [ ] `WordEnrichService` logs `Enrichment model: anthropic/claude-haiku-4-5` on startup
- [ ] `POST /import/enrich` with a batch of 5 words returns correct JSON with `front`, `back`, `article`, `categoryName`, `exampleTarget`, `exampleNative` for all words
- [ ] Setting `ENRICHMENT_MODEL=google/gemini-2.5-flash` in `.env` and restarting causes enrichment to use Gemini instead — no code change required
- [ ] The `INTER_BATCH_DELAY_MS` (3.5s) and batch size (10) are unchanged — Haiku has a higher RPM limit than Gemma free, but we keep conservative throttling for safety
- [ ] `tsc --noEmit` passes
- [ ] Unit test: `enrichBatch()` calls `openRouter.generateText()` with `model: 'anthropic/claude-haiku-4-5'`

---

---

## LC-122 · Confirm `ImageExtractService` uses direct Gemini (audit + test)

**Epic:** Tiered AI Routing
**Phase:** 2 — Vision audit
**Points:** 1
**Depends on:** nothing (audit only)

### User story

As a developer, I want to confirm that `ImageExtractService` (Phase 1 image → raw words) uses `GeminiAdapter.generateVision()` directly, so that image extraction uses Gemini's native multimodal API at $0.30/M tokens, not the OpenRouter passthrough.

### Context

There are currently two extraction paths:

1. `ImageImportService` (legacy, `POST /import/image`) → uses `OpenRouterAdapter.generateVision()` with Gemma 4 free
2. `ImageExtractService` (new Phase 1, `POST /import/image/extract`) → this ticket verifies which adapter it uses

The intent is for `ImageExtractService` to use direct Gemini (`GeminiAdapter.generateVision()`).

### Audit

Read `apps/api/src/import/image-extract.service.ts` and verify the injected adapter.

**If it already uses `GeminiAdapter`:** Document this, write the acceptance-criteria tests, close the ticket.

**If it uses `OpenRouterAdapter`:** Change the injection to `GeminiAdapter` and update the prompt call:

```typescript
// apps/api/src/import/image-extract.service.ts

// BEFORE (if using OpenRouter):
constructor(
  private readonly openRouter:    OpenRouterAdapter,
  private readonly promptBuilder: ImageImportPromptBuilder,
) {}

// AFTER (correct):
constructor(
  private readonly gemini:        GeminiAdapter,
  private readonly promptBuilder: ImageImportPromptBuilder,
) {}

// In extractRawWords():
rawText = await this.gemini.generateVision({
  imageBase64: dto.imageBase64,
  mimeType:    dto.mimeType,
  prompt,
  maxTokens:   4096,
});
```

### Why Gemini direct for vision?

- `GeminiAdapter.generateVision()` uses `gemini-2.5-flash` natively via the `@google/genai` SDK
- Native API has better multimodal handling for base64 images than OpenRouter's passthrough
- `GeminiAdapter` already has a token-bucket rate limiter and falls back to `gemini-2.5-flash-lite` on 429 — that resilience is already built in (no need to replicate in OpenRouter)
- `GEMINI_API_KEY` is already configured in production

### Files to check / modify

| File | Change |
|------|--------|
| `apps/api/src/import/image-extract.service.ts` | Verify adapter; switch to `GeminiAdapter` if not already |

### Acceptance criteria

- [ ] `ImageExtractService` injects and calls `GeminiAdapter`, NOT `OpenRouterAdapter`
- [ ] `POST /import/image/extract` with a test image returns `WordExtractionResult` with `modelUsed` containing `gemini`
- [ ] The Gemini Flash-Lite fallback in `GeminiAdapter` is triggered when simulating a 429 from the Gemini API
- [ ] `tsc --noEmit` passes

---

---

## LC-123 · Tier-aware `textProviderForTier()` in `StoryGenerationService`

**Epic:** Tiered AI Routing
**Phase:** 3 — Story routing
**Points:** 3
**Depends on:** LC-119, LC-120, and LC-107 (subscription tier lookup from the subscription epic)

### User story

As a product owner, I want story generation to automatically use Claude Sonnet 4.6 for Pro subscribers and Gemini 2.5 Flash for free users — both routed through the same OpenRouter API key — so that quality is maximised for paying users and cost is minimised for free users.

### Context

`StoryGenerationService` currently has a `textProvider` getter that reads `AI_DEFAULT_PROVIDER`:

```typescript
private get textProvider() {
  const provider = this.config.get<AiConfig>('ai')!.defaultProvider;
  switch (provider) {
    case 'openrouter': return this.openRouter;
    case 'gemini':     return this.gemini;
    default:           return this.anthropic;
  }
}
```

This getter returns a whole adapter. After this ticket, we keep the getter as a no-user-context fallback, but `generateAndSave()` resolves the model string based on the user's subscription tier and passes it as a model override to `OpenRouterAdapter`.

**Important:** If the subscription epic (LC-107) is already implemented, `StoryGenerationService` may already have `SubscriptionService` injected and a partial `textProviderForTier()` method. This ticket completes that by routing both Pro and Free calls through `OpenRouterAdapter` with the correct model override string from `AiConfig`.

### Files to modify

| File | Change |
|------|--------|
| `apps/api/src/stories/story-generation.service.ts` | Replace adapter-level routing with model-string routing via `OpenRouterAdapter` |

### Implementation

```typescript
// apps/api/src/stories/story-generation.service.ts

import { Injectable, Logger, BadRequestException, InternalServerErrorException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import type { GenerateStoryDto, Story, /* ... other imports ... */ } from '@lingua-card/shared/domain';
import { CardEntity } from '../cards/card.entity';
import { StoryEntity } from './story.entity';
import { AnthropicAdapter, type AITextRequest } from '../ai/providers/anthropic.adapter';
import { GeminiAdapter } from '../ai/providers/gemini.adapter';
import { OpenRouterAdapter } from '../ai/providers/openrouter.adapter';
import { SubscriptionService } from '../subscriptions/subscription.service';
import { StoryPromptBuilder } from './story-prompt.builder';
import { StoryAudioService } from './story-audio.service';
import { StoryVocabMapper } from './story-vocab.mapper';
import type { AiConfig } from '../config/ai.config';
import type { SubscriptionTier } from '@lingua-card/shared/domain';

@Injectable()
export class StoryGenerationService {
  private readonly logger = new Logger(StoryGenerationService.name);

  // Read model strings once at construction — never change at runtime
  private readonly storyModelPro:  string;
  private readonly storyModelFree: string;

  constructor(
    @InjectRepository(CardEntity)
    private readonly cardRepo:       Repository<CardEntity>,
    @InjectRepository(StoryEntity)
    private readonly storyRepo:      Repository<StoryEntity>,
    private readonly promptBuilder:  StoryPromptBuilder,
    private readonly anthropic:      AnthropicAdapter,     // kept for non-user-context fallback
    private readonly gemini:         GeminiAdapter,        // kept for non-user-context fallback
    private readonly openRouter:     OpenRouterAdapter,    // PRIMARY for all story generation
    private readonly config:         ConfigService,
    private readonly audioService:   StoryAudioService,
    private readonly vocabMapper:    StoryVocabMapper,
    private readonly subscriptions:  SubscriptionService,  // from subscription epic
  ) {
    const ai = this.config.get<AiConfig>('ai')!;
    this.storyModelPro  = ai.storyModelPro;   // e.g. 'anthropic/claude-sonnet-4-6'
    this.storyModelFree = ai.storyModelFree;  // e.g. 'google/gemini-2.5-flash'

    this.logger.log(`Story models — Pro: ${this.storyModelPro} | Free: ${this.storyModelFree}`);
  }

  // ── NEW: resolves the OpenRouter model string for a given subscription tier
  private modelForTier(tier: SubscriptionTier): string {
    return tier === 'pro' ? this.storyModelPro : this.storyModelFree;
  }

  // ── KEPT: fallback for system calls without a userId (e.g. seeding, admin tasks)
  private get textProvider() {
    const provider = this.config.get<AiConfig>('ai')!.defaultProvider;
    switch (provider) {
      case 'openrouter': return this.openRouter;
      case 'gemini':     return this.gemini;
      default:           return this.anthropic;
    }
  }

  async generateAndSave(userId: string, dto: GenerateStoryDto): Promise<Story> {
    // ── 1. SUBSCRIPTION CHECK ──────────────────────────────────────────────
    const status = await this.subscriptions.getStatusForUser(userId);

    if (!status.isActive && status.storiesRemaining !== null && status.storiesRemaining <= 0) {
      throw new ForbiddenException('Story limit reached. Upgrade to Pro for unlimited stories.');
    }

    // ── 2. RESOLVE TIER + MODEL ────────────────────────────────────────────
    const tier  = status.isActive ? 'pro' : 'free';
    const model = this.modelForTier(tier as SubscriptionTier);

    this.logger.log(`Generating story for userId=${userId} tier=${tier} model=${model}`);

    // ── 3. FETCH CARDS ─────────────────────────────────────────────────────
    const cards = await this.cardRepo.find({
      where: { userId, collectionId: In(dto.collectionIds) },
    });

    if (cards.length === 0) {
      throw new BadRequestException('No cards found for the given collections');
    }

    // ── 4. GENERATE STORY TEXT ─────────────────────────────────────────────
    const content = await this.generateTextWithModel(dto, cards, model);

    // ── 5. AUDIO + QUIZ + GRAMMAR + KEYWORDS (unchanged below) ────────────
    // ... all existing code from here is unchanged ...
  }

  // ── RENAMED from generateText() — now accepts explicit model string
  private async generateTextWithModel(
    dto: GenerateStoryDto,
    cards: CardEntity[],
    model: string,
  ): Promise<GeneratedStoryContent> {
    const prompt = this.promptBuilder.build(dto, cards);

    let rawText: string;
    try {
      const response = await this.openRouter.generateText({
        messages:  [{ role: 'user', content: prompt }],
        maxTokens: 8192,
        model,     // ← explicit model override
      });
      rawText = response.text;
      this.logger.log(
        `Story text generated | model=${response.model} | ` +
        `tokens=${response.inputTokens}in/${response.outputTokens}out`
      );
    } catch (err) {
      this.logger.error('Story text generation error', err);
      throw new InternalServerErrorException('Story generation failed. Please try again.');
    }

    // ... JSON parsing unchanged ...
  }

  // generateQuizQuestions(), generateGrammarNotes(), generateKeywords()
  // — see LC-124 below for tier-aware updates
}
```

### Acceptance criteria

- [ ] A Pro user (`tier === 'pro'`) generates a story → API log shows `model=anthropic/claude-sonnet-4-6`
- [ ] A free user (`tier === 'free'`) generates a story → API log shows `model=google/gemini-2.5-flash`
- [ ] Changing `STORY_MODEL_PRO=anthropic/claude-opus-4-6` in env and restarting switches Pro stories to Opus — no code change needed
- [ ] A free user at their story limit (0 remaining) still gets HTTP 403 — subscription gate is unchanged
- [ ] `textProvider` getter (legacy fallback) still works — no other code paths break
- [ ] `tsc --noEmit` passes

---

---

## LC-124 · Pass tier through sub-generators (quiz / grammar / keywords)

**Epic:** Tiered AI Routing
**Phase:** 3 — Sub-generators
**Points:** 2
**Depends on:** LC-123

### User story

As a developer, I want quiz questions, grammar notes, and keywords to use the same model as the main story text — so that free users don't accidentally get Sonnet-quality quiz generation, and Pro users get consistent quality across all story sections.

### Context

Story generation fires 4 parallel calls via `Promise.all()`:
1. Main story text — fixed in LC-123
2. `generateQuizQuestions(sentences, difficulty)` — currently calls `this.textProvider`
3. `generateGrammarNotes(sentences, difficulty)` — currently calls `this.textProvider`
4. `generateKeywords(sentences, difficulty)` — currently calls `this.textProvider`

All three private methods use `this.textProvider` (the adapter-level getter). After this ticket they all accept a `model: string` parameter and pass it through `openRouter.generateText()`.

### Files to modify

| File | Change |
|------|--------|
| `apps/api/src/stories/story-generation.service.ts` | Add `model` param to three private generate methods |

### Implementation

```typescript
// Add model parameter to each private sub-generator

private async generateQuizQuestions(
  sentences: StorySentence[],
  difficulty: string,
  model: string,           // ← new param
): Promise<StoryQuizQuestion[]> {
  try {
    const prompt = this.promptBuilder.buildQuizPrompt(sentences, difficulty as any);
    const response = await this.openRouter.generateText({
      messages:  [{ role: 'user', content: prompt }],
      maxTokens: 2048,
      model,     // ← pass through
    });
    // ... parsing unchanged ...
  } catch (err) {
    this.logger.warn('Quiz generation failed, story saved without quiz', err);
    return [];
  }
}

private async generateGrammarNotes(
  sentences: StorySentence[],
  difficulty: string,
  model: string,           // ← new param
): Promise<StoryGrammarNote[]> {
  try {
    const prompt = this.promptBuilder.buildGrammarPrompt(sentences, difficulty as any);
    const response = await this.openRouter.generateText({
      messages:  [{ role: 'user', content: prompt }],
      maxTokens: 3072,
      model,     // ← pass through
    });
    // ... parsing unchanged ...
  } catch (err) {
    this.logger.warn('Grammar notes generation failed', err);
    return [];
  }
}

private async generateKeywords(
  sentences: StorySentence[],
  difficulty: string,
  model: string,           // ← new param
): Promise<StoryKeyword[]> {
  try {
    const prompt = this.promptBuilder.buildKeywordsPrompt(sentences, difficulty as any);
    const response = await this.openRouter.generateText({
      messages:  [{ role: 'user', content: prompt }],
      maxTokens: 2048,
      model,     // ← pass through
    });
    // ... parsing unchanged ...
  } catch (err) {
    this.logger.warn('Keyword generation failed', err);
    return [];
  }
}

// In generateAndSave() — update the Promise.all() call to pass model:
const [quizQuestions, grammarNotes, aiKeywords] = await Promise.all([
  this.generateQuizQuestions(sentences, dto.difficulty, model),  // ← pass model
  this.generateGrammarNotes(sentences, dto.difficulty, model),   // ← pass model
  this.generateKeywords(sentences, dto.difficulty, model),       // ← pass model
]);
```

### Acceptance criteria

- [ ] All 4 AI calls in a single story generation use the same model string
- [ ] A free user: story + quiz + grammar + keywords all route through `google/gemini-2.5-flash`
- [ ] A Pro user: story + quiz + grammar + keywords all route through `anthropic/claude-sonnet-4-6`
- [ ] Failures in quiz/grammar/keywords still don't block the story from saving (existing non-blocking behaviour preserved)
- [ ] `tsc --noEmit` passes

---

---

## LC-125 · Update `.env.example` and `render.yaml`

**Epic:** Tiered AI Routing
**Phase:** 4 — Deploy
**Points:** 1
**Depends on:** LC-119 (config fields already added there — this ticket verifies completeness)

### User story

As a developer deploying to production, I want `.env.example` and `render.yaml` to reflect the final state of all AI routing config, including clear documentation of which model handles which task and estimated costs.

### Files to modify

| File | Change |
|------|--------|
| `apps/api/.env.example` | Final AI section with all routing vars documented |
| `render.yaml` | All new env var entries |

### Final AI section in `.env.example`

```bash
# ── AI providers ───────────────────────────────────────────────────────────────
GEMINI_API_KEY=          # aistudio.google.com — image extraction + TTS fallback
ANTHROPIC_API_KEY=       # anthropic.com — direct fallback only (main usage via OpenRouter)
AI_DEFAULT_PROVIDER=gemini   # gemini | anthropic | openrouter (system-level default)

# ── OpenRouter (single key for enrichment + story generation) ──────────────────
# One API key routes to both Anthropic (Haiku/Sonnet) and Google (Gemini Flash)
# Get key: openrouter.ai → Keys → Create key (starts sk-or-v1-)
# Deposit $10 once to unlock 1000 free req/day on :free models
OPENROUTER_API_KEY=
OPENROUTER_VISION_MODEL=google/gemma-4-26b-a4b-it:free  # legacy single-pass fallback
OPENROUTER_TEXT_MODEL=google/gemma-4-26b-a4b-it:free    # generic fallback

# ── Per-task model routing ─────────────────────────────────────────────────────
# Change these to swap models without code changes. All billed via OPENROUTER_API_KEY.
#
# Task               Model                       Cost/1K ops
# Image extraction   GeminiAdapter (direct)      $0.99    (via GEMINI_API_KEY)
# Word enrichment    Haiku 4.5 via OpenRouter     $4.60    per 1000 words
# Story — Pro        Sonnet 4.6 via OpenRouter    $9.30    per 100 stories
# Story — Free       Gemini 2.5 Flash via OR      $1.48    per 100 stories
#
ENRICHMENT_MODEL=anthropic/claude-haiku-4-5
STORY_MODEL_PRO=anthropic/claude-sonnet-4-6
STORY_MODEL_FREE=google/gemini-2.5-flash
```

### Acceptance criteria

- [ ] `.env.example` has all AI routing vars with cost context comments
- [ ] `render.yaml` has `ENRICHMENT_MODEL`, `STORY_MODEL_PRO`, `STORY_MODEL_FREE` entries
- [ ] A fresh developer following `.env.example` can set up the full AI pipeline without reading any other docs
- [ ] No secrets committed — all values in `.env.example` are placeholders or non-sensitive defaults

---

---

## LC-126 · Unit tests for tier routing in `StoryGenerationService`

**Epic:** Tiered AI Routing
**Phase:** 5 — Tests
**Points:** 2
**Depends on:** LC-123, LC-124

### Files to create / modify

| File | Change |
|------|--------|
| `apps/api/src/stories/story-generation.service.spec.ts` | Add tier routing tests |

### Key test cases

```typescript
describe('StoryGenerationService — tier routing', () => {

  describe('generateAndSave() model selection', () => {

    it('uses storyModelPro when user is on Pro tier', async () => {
      // Arrange: mock SubscriptionService.getStatusForUser → { isActive: true, tier: 'pro', ... }
      // Arrange: mock OpenRouterAdapter.generateText → return valid story JSON
      // Arrange: mock cardRepo.find → return 3 cards
      // Act: call generateAndSave('user-pro', dto)
      // Assert: openRouterAdapter.generateText was called with model = 'anthropic/claude-sonnet-4-6'
    });

    it('uses storyModelFree when user is on Free tier', async () => {
      // Arrange: mock SubscriptionService.getStatusForUser → { isActive: false, tier: 'free', storiesRemaining: 2, ... }
      // Assert: openRouterAdapter.generateText was called with model = 'google/gemini-2.5-flash'
    });

    it('all 4 generateText calls use the same model within one story', async () => {
      // Arrange: Pro user
      // Assert: openRouterAdapter.generateText.mock.calls[].every(call => call[0].model === 'anthropic/claude-sonnet-4-6')
    });

    it('throws ForbiddenException when free user has 0 stories remaining', async () => {
      // Arrange: mock SubscriptionService → { isActive: false, storiesRemaining: 0 }
      // Act + Assert: await expect(service.generateAndSave(...)).rejects.toThrow(ForbiddenException)
      // Assert: openRouterAdapter.generateText was NOT called (gate fires before generation)
    });

    it('does not call SubscriptionService when userId is system (no subscription check)', async () => {
      // This tests the legacy textProvider getter path — not the generateAndSave() path
    });

  });

  describe('modelForTier()', () => {

    it('returns storyModelPro for pro tier', () => {
      expect(service['modelForTier']('pro')).toBe('anthropic/claude-sonnet-4-6');
    });

    it('returns storyModelFree for free tier', () => {
      expect(service['modelForTier']('free')).toBe('google/gemini-2.5-flash');
    });

    it('respects env var override — returns correct model from config', () => {
      // Mock ConfigService to return 'anthropic/claude-opus-4-6' for storyModelPro
      // Assert modelForTier('pro') === 'anthropic/claude-opus-4-6'
    });

  });

});
```

### Acceptance criteria

- [ ] All test cases pass with `nx test api`
- [ ] Tests use Jest mocks — no real HTTP calls, no DB connections
- [ ] Model string assertions are exact string comparisons (not `.toContain()`)

---

---

## LC-127 · Integration smoke test: free story → Gemini, pro story → Sonnet

**Epic:** Tiered AI Routing
**Phase:** 5 — Integration test
**Points:** 2
**Depends on:** LC-123, LC-124, LC-125

### User story

As a developer, I want an end-to-end smoke test (against the real API in a staging environment) that confirms model routing is working correctly in production, so that a misconfiguration is caught immediately on deploy rather than discovered by a user.

### Test script (manual / CI)

Create `apps/api/src/stories/__tests__/tier-routing.smoke.ts`:

```typescript
/**
 * Smoke test — run against staging environment with real API keys
 * Usage: STAGING_API_URL=https://linguacard-api.onrender.com \
 *        FREE_USER_TOKEN=<jwt> PRO_USER_TOKEN=<jwt> \
 *        npx ts-node apps/api/src/stories/__tests__/tier-routing.smoke.ts
 */

async function smokeTest() {
  const baseUrl  = process.env['STAGING_API_URL'];
  const freeToken = process.env['FREE_USER_TOKEN'];
  const proToken  = process.env['PRO_USER_TOKEN'];

  // Test 1: Free user story uses Gemini Flash
  const freeStory = await generateStory(baseUrl, freeToken, { length: 'short', difficulty: 'A1' });
  console.assert(
    freeStory.modelUsed?.includes('gemini'),
    `FAIL: Free story used ${freeStory.modelUsed}, expected gemini`
  );
  console.log(`PASS: Free story model = ${freeStory.modelUsed}`);

  // Test 2: Pro user story uses Sonnet
  const proStory = await generateStory(baseUrl, proToken, { length: 'short', difficulty: 'A1' });
  console.assert(
    proStory.modelUsed?.includes('sonnet') || proStory.modelUsed?.includes('claude'),
    `FAIL: Pro story used ${proStory.modelUsed}, expected claude/sonnet`
  );
  console.log(`PASS: Pro story model = ${proStory.modelUsed}`);
}
```

### Backend change needed — expose `modelUsed` on `Story` response

To enable this test, `StoryGenerationService` should persist the model used in the story entity and return it in the response:

```typescript
// In story.entity.ts — add column
@Column({ name: 'model_used', type: 'varchar', nullable: true, default: null })
modelUsed?: string | null;

// In story-generation.service.ts — after generateTextWithModel():
entity.modelUsed = response.model;  // the model string returned by OpenRouter

// In libs/shared/domain/src/index.ts — add to Story interface:
modelUsed?: string | null;
```

### Acceptance criteria

- [ ] `Story` entity has `model_used` column (nullable, no migration needed for existing rows)
- [ ] `Story` domain type has `modelUsed?: string | null`
- [ ] Generated stories return `modelUsed` in the API response
- [ ] Smoke test script passes against staging environment with correct model strings
- [ ] Free user story: `modelUsed` contains `gemini` or `gemini-2.5-flash`
- [ ] Pro user story: `modelUsed` contains `claude` or `sonnet`

---

---

## LC-128 · Update `CLAUDE.md` and documentation

**Epic:** Tiered AI Routing
**Phase:** 6 — Docs
**Points:** 1
**Depends on:** all tickets above

### Files to modify

| File | Change |
|------|--------|
| `CLAUDE.md` | Add epic to table; update AI provider documentation section |
| `apps/mobile/epic-tiered-ai-routing.md` | This file — copy to project |

### `CLAUDE.md` epic table addition

```markdown
| 13 | Tiered AI Routing | ✅ Implemented | `apps/api/src/stories/`, `apps/api/src/import/word-enrich.service.ts`, `apps/mobile/epic-tiered-ai-routing.md` |
```

### `CLAUDE.md` AI provider reference (add or update)

```markdown
## AI provider routing (current production config)

| Task                    | Adapter          | Model via                          | Config env var       |
|-------------------------|------------------|------------------------------------|----------------------|
| Image extraction (raw)  | GeminiAdapter    | gemini-2.5-flash (direct)          | GEMINI_API_KEY       |
| Image extraction (legacy)| OpenRouterAdapter| google/gemma-4-26b-a4b-it:free    | OPENROUTER_API_KEY   |
| Word enrichment          | OpenRouterAdapter| anthropic/claude-haiku-4-5         | ENRICHMENT_MODEL     |
| Story — Pro tier         | OpenRouterAdapter| anthropic/claude-sonnet-4-6        | STORY_MODEL_PRO      |
| Story — Free tier        | OpenRouterAdapter| google/gemini-2.5-flash            | STORY_MODEL_FREE     |
| TTS (word audio)         | GoogleCloudTTS   | de-DE-Wavenet-B                    | GOOGLE_CLOUD_TTS_*   |
| Whisper timestamps       | GroqWhisperAdapter| whisper-large-v3-turbo            | GROQ_API_KEY         |
```

### Acceptance criteria

- [ ] `CLAUDE.md` epic table includes Epic 13
- [ ] `CLAUDE.md` has the AI provider routing table so future Claude sessions understand the full routing without searching epics
- [ ] Epic file copied to `apps/mobile/epic-tiered-ai-routing.md` in the project

---

## Implementation order

Work through these in this exact sequence:

1. **LC-119** — Config fields (required before any runtime change)
2. **LC-120** — `OpenRouterAdapter.generateText()` model override (required before LC-121, LC-123)
3. **LC-121** — `WordEnrichService` → Haiku (safe, isolated change)
4. **LC-122** — Audit `ImageExtractService` (quick, run in parallel with LC-121)
5. **LC-123** — `StoryGenerationService` tier routing (requires subscription epic LC-103–118 to be done first)
6. **LC-124** — Sub-generators pass model through (same session as LC-123)
7. **LC-125** — `.env.example` and `render.yaml` (update alongside LC-124)
8. **LC-126** — Unit tests (write after implementation is stable)
9. **LC-127** — Integration smoke test + `modelUsed` field (deploy to staging, verify)
10. **LC-128** — Documentation (last, once everything works)

---

## Non-goals

- No per-user model selection UI (model is determined by tier, not user preference)
- No A/B testing framework or model comparison tooling
- No cost tracking per user (aggregate AI usage only, from existing `AiUsageService` if implemented)
- No automatic tier downgrade if Pro subscription expires mid-story (the check runs at the start of each generation — an in-flight story completes with the model it started with)
- No separate OpenRouter account for free vs Pro (single account, single key, OpenRouter handles billing internally)
- No changes to TTS, Whisper, or Google Cloud TTS — those are out of scope
