# Epic: Google Cloud TTS + Groq Whisper Audio Pipeline
## Replace Gemini TTS (3 RPM bottleneck) with Google Cloud TTS Neural2

> **Epic Number:** LC-114 (continuing from LC-113 offline-first)
> **Feature Areas:** `apps/api/src/ai/providers/`, `apps/api/src/word-audio/`, `apps/api/src/stories/`, `apps/api/src/config/`, `apps/api/.env.example`, `render.yaml`
> **Replaces:** `GeminiAdapter.generateSpeech()` in all call sites
> **Groq Whisper:** Already implemented in `GroqWhisperAdapter` (LC-100). No changes needed.
> **Ticket numbers:** LC-114 through LC-122

---

## Current State Audit

Before writing any code, here is exactly what exists and what needs to change.

### What is already built (do not rebuild)

| Component | File | Status |
|---|---|---|
| `WordAudioService` (NestJS) | `apps/api/src/word-audio/word-audio.service.ts` | ✅ Complete — `resolve()`, `batchResolve()`, `generateAndPersist()`, in-flight deduplication |
| `WordAudioEntity` + migration | `apps/api/src/word-audio/word-audio.entity.ts` | ✅ Complete — `word_audio` table, normalized_text index, unique constraint |
| `WordAudioService` (Angular) | `apps/mobile/src/app/shared/audio/word-audio.service.ts` | ✅ Complete — memory cache → device cache → API → Web Speech fallback |
| `GroqWhisperAdapter` | `apps/api/src/ai/providers/groq-whisper.adapter.ts` | ✅ Complete — replaces OpenAI Whisper, already wired into `StoryAudioService` |
| `StoryAudioService` | `apps/api/src/stories/story-audio.service.ts` | ✅ Groq Whisper already wired. TTS still calls `GeminiAdapter.generateSpeech()` |
| `AiController.pronunciation` | `apps/api/src/ai/ai.controller.ts` | ✅ Already delegates to `WordAudioService.resolve()` |
| `AiController.tts` | `apps/api/src/ai/ai.controller.ts` | ⚠️ Still calls `GeminiAdapter.generateSpeech()` directly |
| `WordAudioService.generateAndPersist()` | `apps/api/src/word-audio/word-audio.service.ts` | ⚠️ Still calls `GeminiAdapter.generateSpeech()` internally |
| Data migration script | `apps/api/src/word-audio/migration/migrate-card-audio.ts` | ✅ Complete |

### The problem in one sentence

`GeminiAdapter.generateSpeech()` is called in exactly **two** places:

1. `WordAudioService.generateAndPersist()` — all word/sentence pronunciation
2. `StoryAudioService.generateAudioWithTimestamps()` — story narration

Both hit the same `gemini-2.5-flash-preview-tts` model which has a **3 RPM** free tier limit. The token bucket in `GeminiAdapter` enforces this locally, but 3 RPM means 3 audio files per minute globally across all users. For a story (one long TTS call) + a user tapping 🔊 on three words simultaneously, you're already at the limit.

### The fix

Replace both call sites with `GoogleCloudTTSAdapter` which uses:
- **Model:** `de-DE-Neural2-B` (German, male, Neural2 quality)
- **Free tier:** 1 million characters/month, no RPM cap, no request rate limit
- **SDK:** `@google-cloud/text-to-speech` — separate from AI Studio SDK
- **Auth:** Service account JSON (different key from `GEMINI_API_KEY`)

Groq Whisper remains for timestamps — it is already in place and does not change.

---

## Architecture After This Epic

```
WORD PRONUNCIATION (single word/phrase)
─────────────────────────────────────────
User taps 🔊
  → Angular WordAudioService.resolveUrl(text, 'de-DE')
      → Memory cache (Map<normalizedKey, url>)       hit? return
      → Device cache (Capacitor Filesystem)           hit? return
      → GET /api/v1/word-audio/lookup?text=&lang=
          → NestJS WordAudioService.resolve()
              → word_audio table lookup               found+ready? return audioUrl
              → GoogleCloudTTSAdapter.generateSpeech()  ← NEW (was Gemini)
              → R2 upload → insert word_audio row → return audioUrl
      → Web Speech API fallback                        if all fails

STORY NARRATION (full story text)
─────────────────────────────────────────
POST /stories/:id/audio
  → StoryAudioService.generateAudioWithTimestamps(bodyDe, storyId)
      → GoogleCloudTTSAdapter.generateSpeech()  ← NEW (was Gemini)
      → R2 upload
      → GroqWhisperAdapter.transcribeWithTimestamps()  ← already in place
      → StoryVocabMapper.markVocabWords()
      → return { audioUrl, timestamps, durationMs }

DIRECT TTS ENDPOINT (POST /ai/tts)
─────────────────────────────────────────
  → AiController.tts()
      → GoogleCloudTTSAdapter.generateSpeech()  ← NEW (was Gemini)
      → stream bytes back to client
```

---

## Account Setup (Manual — LC-114, Phase 0)

**This must be done before any code is written. Nothing else in this epic works without the service account.**

### Step 1 — Create or use existing Google Cloud project

1. Go to **https://console.cloud.google.com**
2. Create a new project named `linguacard-production` (or use an existing one)
   - Note the **Project ID** — you'll need it in Step 3

### Step 2 — Enable the Text-to-Speech API

1. In the console, navigate to **APIs & Services → Library**
2. Search for **Cloud Text-to-Speech API**
3. Click it → click **Enable**
4. Wait for enablement to complete (usually < 30 seconds)

### Step 3 — Create a service account

1. Navigate to **IAM & Admin → Service Accounts**
2. Click **Create Service Account**
3. Name: `linguacard-tts`
4. Description: `LinguaCard Google Cloud TTS access`
5. Click **Create and Continue**
6. Role: Select **Cloud Text-to-Speech Service Agent** (under Cloud Text-to-Speech)
   - If that exact role isn't visible, use **Basic → Editor** (less precise but works)
7. Click **Continue** → **Done**

### Step 4 — Download the JSON key

1. Click on the newly created `linguacard-tts` service account
2. Go to the **Keys** tab
3. Click **Add Key → Create new key**
4. Choose **JSON** → **Create**
5. The JSON file downloads automatically. **Keep this file secure.**
6. **Never commit this file to git.** Add `*.json` to `.gitignore` if not already there.

### Step 5 — Prepare the key for environment variables

The JSON key must be stored as a single-line string (base64 encoded) for safe use in environment variables and Render:

```bash
# On Mac/Linux — base64 encode the JSON key file
cat your-key-file.json | base64 | tr -d '\n'
# Copy the output — this is your GOOGLE_CLOUD_TTS_KEY_BASE64 value
```

Or store the raw JSON as a single environment variable (Render supports multiline secrets):
```bash
# Store the raw JSON content directly
cat your-key-file.json
# Copy the entire JSON content as the env var value
```

### Step 6 — Add to local `.env`

```bash
# apps/api/.env
GOOGLE_CLOUD_TTS_KEY_BASE64=<base64-encoded-json-key>
# OR store as raw JSON:
GOOGLE_CLOUD_TTS_KEY_JSON={"type":"service_account","project_id":"..."}

GOOGLE_CLOUD_TTS_VOICE=de-DE-Neural2-B
GOOGLE_CLOUD_TTS_LANGUAGE=de-DE
```

### Step 7 — Add to Render (production)

1. Go to **https://dashboard.render.com** → your `linguacard-api` service
2. Click **Environment** in the left sidebar
3. Add the following environment variables:
   - `GOOGLE_CLOUD_TTS_KEY_BASE64` → paste the base64-encoded JSON key
   - `GOOGLE_CLOUD_TTS_VOICE` → `de-DE-Neural2-B`
   - `GOOGLE_CLOUD_TTS_LANGUAGE` → `de-DE`
4. Click **Save changes** → Render will redeploy

### Step 8 — Verify (manual test)

Run this from your terminal after adding the key to `.env`:

```bash
# Quick verification that the credentials work
node -e "
const tts = require('@google-cloud/text-to-speech');
const key = Buffer.from(process.env.GOOGLE_CLOUD_TTS_KEY_BASE64, 'base64').toString();
const credentials = JSON.parse(key);
const client = new tts.TextToSpeechClient({ credentials });
client.synthesizeSpeech({
  input: { text: 'Hallo Welt' },
  voice: { languageCode: 'de-DE', name: 'de-DE-Neural2-B' },
  audioConfig: { audioEncoding: 'MP3' }
}).then(([r]) => {
  require('fs').writeFileSync('/tmp/test.mp3', r.audioContent);
  console.log('SUCCESS — /tmp/test.mp3 written, play it to verify quality');
}).catch(console.error);
"
```

### Available German Neural2 voices (choose one for `GOOGLE_CLOUD_TTS_VOICE`)

| Voice ID | Gender | Notes |
|---|---|---|
| `de-DE-Neural2-A` | Female | Clear, neutral |
| `de-DE-Neural2-B` | Male | **Recommended default** — clear, authoritative |
| `de-DE-Neural2-C` | Female | Warmer tone |
| `de-DE-Neural2-D` | Male | Slightly younger-sounding |
| `de-DE-Neural2-F` | Female | High clarity |

Listen to samples at: https://cloud.google.com/text-to-speech/docs/voices

---

## Story Map

| Phase | Ticket | Title | Points |
|---|---|---|---|
| 0 — Setup | LC-114 | Account setup, service account, env vars (manual) | 0 |
| 1 — Config | LC-115 | Add Google Cloud TTS config to `AiConfig` and env files | 1 |
| 1 — Adapter | LC-116 | `GoogleCloudTTSAdapter` — NestJS service | 5 |
| 2 — Wire | LC-117 | Wire `WordAudioService.generateAndPersist()` to GCTTS | 2 |
| 2 — Wire | LC-118 | Wire `StoryAudioService` to GCTTS | 2 |
| 2 — Wire | LC-119 | Wire `AiController.tts` to GCTTS | 1 |
| 3 — Quality | LC-120 | SSML improvements for German pronunciation quality | 3 |
| 4 — Fallback | LC-121 | Graceful fallback: GCTTS → Gemini TTS on quota exceeded | 3 |
| 5 — Tests | LC-122 | Unit tests for `GoogleCloudTTSAdapter` | 2 |

**Total: 19 points**

---

---

## LC-115 · Add Google Cloud TTS config to `AiConfig` and env files

**Epic:** Google Cloud TTS Migration
**Phase:** 1 — Config
**Points:** 1
**Depends on:** LC-114 (key must exist)

### Files to modify

| File | Change |
|---|---|
| `apps/api/src/config/ai.config.ts` | Add `googleCloudTtsKeyBase64`, `googleCloudTtsVoice`, `googleCloudTtsLanguage` |
| `apps/api/.env.example` | Add three new `GOOGLE_CLOUD_TTS_*` placeholders |
| `render.yaml` | Add three new env var entries |

### Implementation

```typescript
// apps/api/src/config/ai.config.ts
export interface AiConfig {
  // ... existing fields (geminiApiKey, anthropicApiKey, etc.) ...
  googleCloudTtsKeyBase64: string;   // ← new: base64-encoded service account JSON
  googleCloudTtsVoice:     string;   // ← new: default 'de-DE-Neural2-B'
  googleCloudTtsLanguage:  string;   // ← new: default 'de-DE'
}

export const aiConfig = (): { ai: AiConfig } => ({
  ai: {
    // ... existing fields ...
    googleCloudTtsKeyBase64: process.env['GOOGLE_CLOUD_TTS_KEY_BASE64'] ?? '',
    googleCloudTtsVoice:     process.env['GOOGLE_CLOUD_TTS_VOICE']     ?? 'de-DE-Neural2-B',
    googleCloudTtsLanguage:  process.env['GOOGLE_CLOUD_TTS_LANGUAGE']  ?? 'de-DE',
  },
});
```

```bash
# apps/api/.env.example — add in the AI providers section

# ── Google Cloud TTS (word pronunciation + story narration) ──────────────────
# Service account setup: console.cloud.google.com → IAM → Service Accounts
# base64 encode the downloaded JSON key: cat key.json | base64 | tr -d '\n'
GOOGLE_CLOUD_TTS_KEY_BASE64=         # base64-encoded service account JSON
GOOGLE_CLOUD_TTS_VOICE=de-DE-Neural2-B   # see: gcloud.google.com/text-to-speech/docs/voices
GOOGLE_CLOUD_TTS_LANGUAGE=de-DE
```

```yaml
# render.yaml — add to envVars list
- key: GOOGLE_CLOUD_TTS_KEY_BASE64
  sync: false        # paste the base64 key in Render dashboard; never in yaml
- key: GOOGLE_CLOUD_TTS_VOICE
  value: de-DE-Neural2-B
- key: GOOGLE_CLOUD_TTS_LANGUAGE
  value: de-DE
```

### Acceptance criteria

- [ ] `AiConfig` compiles with three new fields
- [ ] `.env.example` has all three `GOOGLE_CLOUD_TTS_*` entries with comments
- [ ] `render.yaml` has the three new entries; `KEY_BASE64` is `sync: false`
- [ ] If `GOOGLE_CLOUD_TTS_KEY_BASE64` is empty, the adapter logs a warning on startup but does not crash the app (fails gracefully on first call instead)

---

---

## LC-116 · `GoogleCloudTTSAdapter` — NestJS service

**Epic:** Google Cloud TTS Migration
**Phase:** 1 — Adapter
**Points:** 5
**Depends on:** LC-115

### User story

As a developer, I want a NestJS `GoogleCloudTTSAdapter` that wraps the `@google-cloud/text-to-speech` SDK and returns `{ audioBuffer, durationMs, mimeType }` — the same shape as `GeminiAdapter.generateSpeech()` — so that `WordAudioService` and `StoryAudioService` can swap providers without changing their own logic.

### Install SDK

```bash
cd apps/api
npm install @google-cloud/text-to-speech
```

### Files to create

| File | Purpose |
|---|---|
| `apps/api/src/ai/providers/google-cloud-tts.adapter.ts` | New adapter |

### Implementation

```typescript
// apps/api/src/ai/providers/google-cloud-tts.adapter.ts
import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TextToSpeechClient, protos } from '@google-cloud/text-to-speech';
import type { AiConfig } from '../../config/ai.config';

export interface TTSSpeechRequest {
  text:      string;
  voice?:    string;   // overrides config default; useful for per-call variation
  language?: string;   // overrides config default
  ssml?:     boolean;  // if true, `text` is treated as SSML markup
  speed?:    number;   // speaking rate 0.25–4.0, default 1.0
}

export interface TTSSpeechResponse {
  audioBuffer: ArrayBuffer;
  durationMs:  number;
  mimeType:    'audio/mpeg';  // GCTTS always returns MP3 when AudioEncoding.MP3 is set
  characterCount: number;     // for quota monitoring
}

@Injectable()
export class GoogleCloudTTSAdapter implements OnModuleInit {
  private readonly logger  = new Logger(GoogleCloudTTSAdapter.name);
  private client!: TextToSpeechClient;
  private readonly defaultVoice:    string;
  private readonly defaultLanguage: string;
  private isConfigured = false;

  constructor(private readonly config: ConfigService) {
    const ai = this.config.get<AiConfig>('ai')!;
    this.defaultVoice    = ai.googleCloudTtsVoice    || 'de-DE-Neural2-B';
    this.defaultLanguage = ai.googleCloudTtsLanguage || 'de-DE';
  }

  onModuleInit(): void {
    const ai = this.config.get<AiConfig>('ai')!;
    const keyBase64 = ai.googleCloudTtsKeyBase64;

    if (!keyBase64) {
      this.logger.warn(
        'GOOGLE_CLOUD_TTS_KEY_BASE64 is not set. ' +
        'GoogleCloudTTSAdapter will not generate audio. ' +
        'Set up the service account and add the key to resolve this.'
      );
      return;
    }

    try {
      const keyJson  = Buffer.from(keyBase64, 'base64').toString('utf-8');
      const credentials = JSON.parse(keyJson);
      this.client = new TextToSpeechClient({ credentials });
      this.isConfigured = true;
      this.logger.log(
        `GoogleCloudTTSAdapter initialised. ` +
        `Voice: ${this.defaultVoice} | Language: ${this.defaultLanguage}`
      );
    } catch (err) {
      this.logger.error(
        'Failed to parse GOOGLE_CLOUD_TTS_KEY_BASE64 — is the value valid base64-encoded JSON?',
        err,
      );
    }
  }

  async generateSpeech(request: TTSSpeechRequest): Promise<TTSSpeechResponse> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        'Google Cloud TTS is not configured. ' +
        'Add GOOGLE_CLOUD_TTS_KEY_BASE64 to your environment.'
      );
    }

    const voiceName    = request.voice    ?? this.defaultVoice;
    const languageCode = request.language ?? this.defaultLanguage;
    const speakingRate = request.speed    ?? 1.0;

    // Build input — SSML or plain text
    const input: protos.google.cloud.texttospeech.v1.ISynthesisInput = request.ssml
      ? { ssml: request.text }
      : { text: request.text };

    // Character count for free-tier quota monitoring
    const characterCount = request.text.length;

    const [response] = await this.client.synthesizeSpeech({
      input,
      voice: {
        languageCode,
        name: voiceName,
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate,
        // MP3 at 32kbps is sufficient for speech; reduces file size by ~60% vs 128kbps
        // without audible quality loss for human speech
        sampleRateHertz: 24000,
      },
    });

    if (!response.audioContent) {
      throw new ServiceUnavailableException('Google Cloud TTS returned no audio content');
    }

    const audioBuffer = (response.audioContent as Buffer).buffer.slice(
      (response.audioContent as Buffer).byteOffset,
      (response.audioContent as Buffer).byteOffset + (response.audioContent as Buffer).byteLength,
    ) as ArrayBuffer;

    // Estimate duration from MP3 bitrate (32kbps = 4000 bytes/sec)
    const bytesPerSecond = 4000;
    const durationMs = Math.round((audioBuffer.byteLength / bytesPerSecond) * 1000);

    this.logger.debug(
      `GCTTS generated ${characterCount} chars → ${audioBuffer.byteLength} bytes ` +
      `(${durationMs}ms) via ${voiceName}`
    );

    return { audioBuffer, durationMs, mimeType: 'audio/mpeg', characterCount };
  }

  /** Health check — verifies credentials are valid without consuming quota */
  async ping(): Promise<boolean> {
    if (!this.isConfigured) return false;
    try {
      await this.client.listVoices({ languageCode: 'de-DE' });
      return true;
    } catch {
      return false;
    }
  }
}
```

### Register in `AiModule`

```typescript
// apps/api/src/ai/ai.module.ts
import { GoogleCloudTTSAdapter } from './providers/google-cloud-tts.adapter';

@Module({
  providers: [
    AnthropicAdapter,
    OpenAIAdapter,
    GeminiAdapter,
    OpenRouterAdapter,
    GroqWhisperAdapter,
    GoogleCloudTTSAdapter,   // ← new
    StorageService,
  ],
  exports: [
    AnthropicAdapter,
    OpenAIAdapter,
    GeminiAdapter,
    OpenRouterAdapter,
    GroqWhisperAdapter,
    GoogleCloudTTSAdapter,   // ← new
    StorageService,
  ],
})
export class AiModule {}
```

### Acceptance criteria

- [ ] `npm install @google-cloud/text-to-speech` added to `apps/api/package.json`
- [ ] `GoogleCloudTTSAdapter` compiles with no TypeScript errors
- [ ] `onModuleInit()` logs a clear warning if key is missing but does NOT throw (app starts without TTS configured)
- [ ] `generateSpeech()` returns `{ audioBuffer, durationMs, mimeType: 'audio/mpeg', characterCount }`
- [ ] `generateSpeech()` with SSML input passes `{ ssml: ... }` not `{ text: ... }` to the SDK
- [ ] `generateSpeech()` throws `ServiceUnavailableException` if not configured (not a 500 crash)
- [ ] `ping()` returns `true` when credentials are valid, `false` otherwise
- [ ] `GoogleCloudTTSAdapter` exported from `AiModule`
- [ ] Manual test: `generateSpeech({ text: 'der Hund' })` produces a playable MP3

---

---

## LC-117 · Wire `WordAudioService.generateAndPersist()` to GCTTS

**Epic:** Google Cloud TTS Migration
**Phase:** 2 — Wire
**Points:** 2
**Depends on:** LC-116

### User story

As the system, I want all word and sentence pronunciation audio to be generated via Google Cloud TTS instead of Gemini TTS, so that the 3 RPM Gemini limit no longer affects pronunciation playback anywhere in the app.

### Context

`WordAudioService.generateAndPersist()` is the single backend function responsible for generating audio for every word, phrase, and sentence pronunciation in the entire app. It is called by `WordAudioService.resolve()` and `batchResolve()` whenever a requested word doesn't have audio yet. Right now it injects `GeminiAdapter` and calls `generateSpeech()`. Swapping to `GoogleCloudTTSAdapter` here fixes pronunciation globally.

### Files to modify

| File | Change |
|---|---|
| `apps/api/src/word-audio/word-audio.service.ts` | Replace `GeminiAdapter` injection with `GoogleCloudTTSAdapter`; update `generateAndPersist()` |
| `apps/api/src/word-audio/word-audio.module.ts` | Import `AiModule` to get `GoogleCloudTTSAdapter` |

### Implementation

```typescript
// apps/api/src/word-audio/word-audio.service.ts
import { GoogleCloudTTSAdapter } from '../ai/providers/google-cloud-tts.adapter';
// Remove: import { GeminiAdapter } from '../ai/providers/gemini.adapter';

@Injectable()
export class WordAudioService {
  constructor(
    @InjectRepository(WordAudioEntity)
    private readonly repo: WordAudioRepository,
    private readonly tts: GoogleCloudTTSAdapter,   // ← was GeminiAdapter
    private readonly storage: StorageService,
    private readonly logger: Logger,
  ) {}

  // generateAndPersist() — only one line changes:
  private async generateAndPersist(
    normalizedText: string,
    displayText: string,
    language: string,
    existing?: WordAudioEntity,
  ): Promise<WordAudioEntity> {
    const entity = existing ?? this.repo.create({
      id: randomUUID(),
      normalizedText,
      displayText,
      language,
      status: 'pending',
    });

    try {
      // ← was: const speech = await this.gemini.generateSpeech({ text: displayText, language })
      const speech = await this.tts.generateSpeech({
        text: displayText,
        language,
        ssml: false,
      });

      const hash        = audioStorageHash(normalizedText, language);
      const storagePath = `word-audio/${hash}.mp3`;  // mp3 now (was wav from Gemini)
      const audioUrl    = await this.storage.upload(
        Buffer.from(speech.audioBuffer),
        storagePath,
        'audio/mpeg',  // mp3 content type
      );

      entity.audioUrl    = audioUrl;
      entity.storagePath = storagePath;
      entity.durationMs  = speech.durationMs;
      entity.status      = 'ready';
      entity.failedAt    = null;

      return this.repo.save(entity);
    } catch (err: unknown) {
      entity.status   = 'failed';
      entity.failedAt = new Date();
      await this.repo.save(entity);
      throw err;
    }
  }
}
```

### Note on file extension change

Gemini TTS returned WAV (PCM). Google Cloud TTS returns MP3. The `word_audio` `storagePath` column stores the full path including extension. Existing rows with `.wav` paths continue to work — the migration is forward-only. New entries will have `.mp3` paths.

### Acceptance criteria

- [ ] `WordAudioService` no longer imports or injects `GeminiAdapter`
- [ ] `generateAndPersist()` calls `GoogleCloudTTSAdapter.generateSpeech()`
- [ ] New `word_audio` rows have `storagePath` ending in `.mp3`
- [ ] Existing `.wav` rows continue to serve correctly (no backfill needed)
- [ ] Manual QA: tap 🔊 on a new word → hear clear German pronunciation → `word_audio` row inserted with `status='ready'`
- [ ] Manual QA: tap 🔊 on same word again → no new TTS call (served from DB/cache)

---

---

## LC-118 · Wire `StoryAudioService` to GCTTS

**Epic:** Google Cloud TTS Migration
**Phase:** 2 — Wire
**Points:** 2
**Depends on:** LC-116

### User story

As a user, I want story narration to use Google Cloud TTS so that generating a story's audio no longer consumes one of the 3 Gemini TTS RPM tokens, allowing word pronunciation and story audio to coexist without competing for the same quota.

### Files to modify

| File | Change |
|---|---|
| `apps/api/src/stories/story-audio.service.ts` | Replace `GeminiAdapter` injection with `GoogleCloudTTSAdapter` |

### Implementation

```typescript
// apps/api/src/stories/story-audio.service.ts
import { Injectable, Logger } from '@nestjs/common';
import type { WordTimestamp } from '@lingua-card/shared/domain';
import { GoogleCloudTTSAdapter } from '../ai/providers/google-cloud-tts.adapter';  // ← was GeminiAdapter
import { GroqWhisperAdapter } from '../ai/providers/groq-whisper.adapter';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class StoryAudioService {
  private readonly logger = new Logger(StoryAudioService.name);

  constructor(
    private readonly tts:         GoogleCloudTTSAdapter,  // ← was GeminiAdapter
    private readonly groqWhisper: GroqWhisperAdapter,
    private readonly storage:     StorageService,
  ) {}

  async generateAudioWithTimestamps(
    storyText: string,
    storyId:   string,
  ): Promise<{ audioUrl: string | null; timestamps: WordTimestamp[]; durationMs: number }> {
    let audioBuffer: ArrayBuffer;
    let durationMs:  number;

    try {
      const speech = await this.tts.generateSpeech({
        text:     storyText,
        language: 'de-DE',
        speed:    0.9,         // slightly slower for learner comprehension
        ssml:     false,
      });
      audioBuffer = speech.audioBuffer;
      durationMs  = speech.durationMs;
    } catch (err) {
      this.logger.error(`Google Cloud TTS failed for story ${storyId}`, err);
      return { audioUrl: null, timestamps: [], durationMs: 0 };
    }

    const audioUrl = await this.storage.upload(
      Buffer.from(audioBuffer),
      `stories/${storyId}.mp3`,
      'audio/mpeg',
    );

    let timestamps: WordTimestamp[];
    try {
      // Groq Whisper already in place — no changes here
      timestamps = await this.groqWhisper.transcribeWithTimestamps(audioBuffer, 'audio/mpeg');
    } catch (err) {
      this.logger.error(`Groq Whisper failed for story ${storyId}`, err);
      timestamps = [];
    }

    return { audioUrl, timestamps, durationMs };
  }
}
```

### Acceptance criteria

- [ ] `StoryAudioService` no longer imports or injects `GeminiAdapter`
- [ ] Story audio is generated as MP3 (was WAV from Gemini)
- [ ] `stories/{storyId}.mp3` stored in R2 (was `.wav`)
- [ ] Groq Whisper continues to receive the audio buffer and return word timestamps
- [ ] `speaking_rate: 0.9` applied for learner-friendly pace
- [ ] Manual QA: generate a story → audio plays → karaoke words highlight correctly

---

---

## LC-119 · Wire `AiController.tts` to GCTTS

**Epic:** Google Cloud TTS Migration
**Phase:** 2 — Wire
**Points:** 1
**Depends on:** LC-116

### Context

`POST /ai/tts` is a direct TTS endpoint used by the Angular `GeminiAdapter` (client-side) for story audio generation in `AiOrchestrationService.generateSpeechWithTimestamps()`. It currently calls `GeminiAdapter.generateSpeech()`. This is the last remaining call site.

### Files to modify

| File | Change |
|---|---|
| `apps/api/src/ai/ai.controller.ts` | Replace `GeminiAdapter` injection with `GoogleCloudTTSAdapter` in `tts()` method |

### Implementation

```typescript
// apps/api/src/ai/ai.controller.ts
@Controller('ai')
export class AiController {
  constructor(
    private readonly tts:       GoogleCloudTTSAdapter,   // ← was GeminiAdapter
    private readonly storage:   StorageService,
    @Inject(forwardRef(() => WordAudioService))
    private readonly wordAudio: WordAudioService,
  ) {}

  @Post('tts')
  async ttsEndpoint(@Body() dto: TtsRequestDto, @Res() res: Response): Promise<void> {
    try {
      const speech = await this.tts.generateSpeech({
        text:     dto.text,
        voice:    dto.voice,
        language: dto.language ?? 'de-DE',
      });

      res.set({
        'Content-Type':        'audio/mpeg',
        'Content-Disposition': 'inline; filename="tts.mp3"',
        'Content-Length':      speech.audioBuffer.byteLength,
      });
      res.send(Buffer.from(speech.audioBuffer));
    } catch (err) {
      this.handleTtsError(err, res);
    }
  }
  // pronunciation() method — unchanged (already uses WordAudioService)
}
```

### Acceptance criteria

- [ ] `AiController` no longer injects `GeminiAdapter` (it still imports it indirectly if needed elsewhere, but not in this controller)
- [ ] `POST /ai/tts` returns `audio/mpeg` (was `audio/wav` or `audio/pcm` from Gemini)
- [ ] Angular `GeminiAdapter.generateSpeech()` receives MP3 bytes — update the `bytesPerSecond` duration estimate to match MP3 bitrate (32kbps = 4000 bytes/sec)
- [ ] Angular `AiOrchestrationService.generateSpeechWithTimestamps()` — no changes needed (handles `ArrayBuffer` regardless of format)

---

---

## LC-120 · SSML improvements for German pronunciation quality

**Epic:** Google Cloud TTS Migration
**Phase:** 3 — Quality
**Points:** 3
**Depends on:** LC-116

### User story

As a language learner, I want German words pronounced with correct emphasis and natural pauses, so that I learn accurate pronunciation rather than robotic TTS output.

### Context

Google Cloud TTS supports SSML (Speech Synthesis Markup Language), which lets you add pronunciation hints, pauses, and emphasis. Gemini TTS had no SSML support. This is a new capability that improves the learning quality of every pronunciation in the app.

### Files to create / modify

| File | Change |
|---|---|
| `apps/api/src/word-audio/ssml-builder.ts` | New — builds SSML markup for German vocabulary |
| `apps/api/src/word-audio/word-audio.service.ts` | Use `SsmlBuilder` in `generateAndPersist()` |

### SSML builder

```typescript
// apps/api/src/word-audio/ssml-builder.ts

/**
 * Builds SSML markup optimised for German vocabulary learning.
 *
 * Pronunciation features applied:
 * - Slow rate for single words (helps learners catch each phoneme)
 * - Pause before noun plural forms: "der Hund, Hunde" → spoken with natural pause
 * - Emphasis on the article for noun phrases
 * - Break after the word before the translation context
 */
export function buildWordSsml(displayText: string): string {
  // Single word or short phrase (≤ 4 words) — slow slightly and add emphasis
  const wordCount = displayText.trim().split(/\s+/).length;

  if (wordCount <= 4) {
    return `<speak>
  <prosody rate="0.85">
    ${escapeXml(displayText)}
  </prosody>
</speak>`;
  }

  // Longer phrase (e.g. verb phrase "frei haben, er hat frei") — normal rate
  return `<speak>
  <prosody rate="0.90">
    ${escapeXml(displayText)}
  </prosody>
</speak>`;
}

/**
 * Builds SSML for story narration.
 * Slightly slower than natural speech for comprehension at B1/B2 level.
 */
export function buildStorySsml(storyText: string): string {
  return `<speak>
  <prosody rate="0.92">
    ${escapeXml(storyText)}
  </prosody>
</speak>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
```

### Wire into `WordAudioService.generateAndPersist()`

```typescript
// apps/api/src/word-audio/word-audio.service.ts
import { buildWordSsml } from './ssml-builder';

// In generateAndPersist():
const speech = await this.tts.generateSpeech({
  text:  buildWordSsml(displayText),   // ← SSML instead of plain text
  language,
  ssml:  true,                          // ← tells adapter to use { ssml: ... } input
});
```

### Wire into `StoryAudioService`

```typescript
// apps/api/src/stories/story-audio.service.ts
import { buildStorySsml } from '../word-audio/ssml-builder';

const speech = await this.tts.generateSpeech({
  text:  buildStorySsml(storyText),
  language: 'de-DE',
  ssml:  true,
});
```

### Acceptance criteria

- [ ] `buildWordSsml()` wraps text in `<speak><prosody rate="0.85">...</prosody></speak>` for short words
- [ ] `buildStorySsml()` wraps text in `<speak><prosody rate="0.92">...</prosody></speak>`
- [ ] Both functions correctly escape XML special characters (`&`, `<`, `>`, `"`, `'`)
- [ ] `buildWordSsml('der Hund & die Katze')` produces `&amp;` not raw `&`
- [ ] `GoogleCloudTTSAdapter.generateSpeech({ ssml: true })` uses `{ ssml: text }` input not `{ text: text }`
- [ ] Unit test: `buildWordSsml('der Hund')` produces valid SSML
- [ ] Unit test: XML special characters are correctly escaped
- [ ] Manual QA: tap 🔊 on "der Hund" — pronunciation is noticeably clearer/slower than Web Speech API fallback

---

---

## LC-121 · Graceful fallback: GCTTS → Gemini TTS on quota exceeded

**Epic:** Google Cloud TTS Migration
**Phase:** 4 — Fallback
**Points:** 3
**Depends on:** LC-117, LC-118, LC-119

### User story

As a user, if Google Cloud TTS fails (quota exceeded, service down, or key misconfigured), I want audio generation to automatically fall back to Gemini TTS, so that pronunciation still works even during GCP outages — just with the original 3 RPM constraint.

### Context

The 1 million free characters/month on GCTTS is extremely generous — a story narration is ~2,000 characters, a word ~10–15 characters. At 100 active users, typical monthly usage would be ~50,000–100,000 characters for a normal app (well within the free tier). The fallback is defensive insurance, not an expected daily path.

### Files to modify

| File | Change |
|---|---|
| `apps/api/src/word-audio/word-audio.service.ts` | Wrap `GoogleCloudTTSAdapter` call with try/catch → Gemini fallback |
| `apps/api/src/stories/story-audio.service.ts` | Same pattern |

### Implementation pattern

```typescript
// Shared fallback utility — inline in both services (simple enough not to extract)

private async generateSpeechWithFallback(
  text: string,
  language: string,
  ssml: boolean,
): Promise<{ audioBuffer: ArrayBuffer; durationMs: number; mimeType: string }> {
  // Primary: Google Cloud TTS (no RPM limit, 1M chars/month free)
  try {
    const speech = await this.tts.generateSpeech({ text, language, ssml });
    return { audioBuffer: speech.audioBuffer, durationMs: speech.durationMs, mimeType: 'audio/mpeg' };
  } catch (primaryErr: unknown) {
    // Only fall back on quota/service errors — not on programming errors
    const isRecoverable =
      (primaryErr as any)?.code === 8 ||    // RESOURCE_EXHAUSTED (quota)
      (primaryErr as any)?.code === 14 ||   // UNAVAILABLE
      (primaryErr as any) instanceof ServiceUnavailableException;

    if (!isRecoverable) throw primaryErr;

    this.logger.warn('Google Cloud TTS unavailable — falling back to Gemini TTS');
  }

  // Fallback: Gemini TTS (3 RPM limit applies here)
  try {
    const speech = await this.gemini.generateSpeech({ text, language });
    return { audioBuffer: speech.audioBuffer, durationMs: speech.durationMs, mimeType: speech.mimeType };
  } catch (fallbackErr: unknown) {
    this.logger.error('Both TTS providers failed', fallbackErr);
    throw new ServiceUnavailableException('Audio generation temporarily unavailable');
  }
}
```

### gRPC error codes reference (Google Cloud SDK)

| Code | Name | Meaning |
|---|---|---|
| 8 | RESOURCE_EXHAUSTED | Quota exceeded — most likely trigger |
| 14 | UNAVAILABLE | Service temporarily down |
| 16 | UNAUTHENTICATED | Bad credentials |
| 7 | PERMISSION_DENIED | Key doesn't have TTS access |

Codes 16 and 7 are NOT recoverable by falling back — they indicate misconfiguration. Let those throw directly.

### Acceptance criteria

- [ ] On GCTTS `RESOURCE_EXHAUSTED` (code 8), falls back to Gemini without surface error to the user
- [ ] On GCTTS `UNAVAILABLE` (code 14), falls back to Gemini without surface error
- [ ] On GCTTS `UNAUTHENTICATED` (code 16) or `PERMISSION_DENIED` (code 7), does NOT fall back — throws immediately with a clear server error (these indicate misconfiguration that needs fixing)
- [ ] On Gemini fallback also failing, throws `ServiceUnavailableException` with a clear message
- [ ] Fallback is logged at `warn` level (not `error`) to distinguish from real failures
- [ ] Unit test: mock GCTTS to throw code 8 → Gemini is called → speech returned
- [ ] Unit test: mock both providers to fail → `ServiceUnavailableException` thrown

---

---

## LC-122 · Unit tests for `GoogleCloudTTSAdapter`

**Epic:** Google Cloud TTS Migration
**Phase:** 5 — Tests
**Points:** 2
**Depends on:** LC-116

### Files to create

| File | Purpose |
|---|---|
| `apps/api/src/ai/providers/google-cloud-tts.adapter.spec.ts` | Unit tests |
| `apps/api/src/word-audio/ssml-builder.spec.ts` | SSML builder tests (if LC-120 is done) |

### Test cases

```typescript
// google-cloud-tts.adapter.spec.ts
describe('GoogleCloudTTSAdapter', () => {

  describe('onModuleInit()', () => {
    it('logs warning and sets isConfigured=false when key is empty');
    it('initialises TextToSpeechClient when valid base64 key is provided');
    it('logs error and sets isConfigured=false when key is malformed JSON');
  });

  describe('generateSpeech()', () => {
    it('throws ServiceUnavailableException when not configured');
    it('calls synthesizeSpeech with { text } input when ssml=false');
    it('calls synthesizeSpeech with { ssml } input when ssml=true');
    it('returns audioBuffer, durationMs, mimeType="audio/mpeg", characterCount');
    it('uses defaultVoice and defaultLanguage when not overridden in request');
    it('uses request.voice and request.language when provided');
    it('applies request.speed as speakingRate');
    it('throws ServiceUnavailableException when SDK returns no audioContent');
  });

  describe('ping()', () => {
    it('returns true when listVoices() resolves');
    it('returns false when not configured');
    it('returns false when listVoices() throws');
  });
});

// ssml-builder.spec.ts
describe('buildWordSsml()', () => {
  it('wraps short word in <speak><prosody rate="0.85">...</prosody></speak>');
  it('wraps long phrase in rate="0.90"');
  it('escapes & as &amp;');
  it('escapes < as &lt;');
  it('escapes > as &gt;');
  it('escapes " as &quot;');
  it('escapes \' as &apos;');
  it('produces valid XML for real German vocab: "der Hund, -e"');
});
```

### Acceptance criteria

- [ ] All 16 test cases pass
- [ ] Tests use jest mocks for `TextToSpeechClient` — no real GCP calls
- [ ] `jest --coverage` shows ≥ 90% branch coverage on `google-cloud-tts.adapter.ts`
- [ ] `jest --coverage` shows ≥ 95% branch coverage on `ssml-builder.ts`

---

---

## What Does NOT Change in This Epic

These are explicitly out of scope to keep the epic focused:

| Item | Reason |
|---|---|
| Angular `GeminiAdapter` (client) | Still used as the client-side speech proxy for `/ai/tts`. The endpoint it calls now uses GCTTS internally, so no client change needed. |
| `GroqWhisperAdapter` | Already correct from LC-100. Zero changes. |
| `WordAudioEntity` schema | No schema changes needed. The `.mp3` extension change is forward-only — existing `.wav` rows work fine. |
| `normalizeForAudio()` function | Normalization logic is TTS-agnostic. Unchanged. |
| Device-side caching in Angular `WordAudioService` | Caching is URL-based, not format-based. Unchanged. |
| Migration scripts (LC-WA12, LC-WA13) | These migrate old card-keyed audio to word registry. They run independently of provider. |
| Story reader karaoke logic | `StoryReaderService` reads `wordTimestamps[].startMs/endMs` — these come from Groq Whisper, not TTS. Unchanged. |

---

## Dependency Chain

```
LC-114 (account setup — manual)
  └── LC-115 (AiConfig + env)
        └── LC-116 (GoogleCloudTTSAdapter — core adapter)
              ├── LC-117 (WordAudioService wiring)
              ├── LC-118 (StoryAudioService wiring)
              ├── LC-119 (AiController.tts wiring)
              ├── LC-120 (SSML improvements — depends on LC-117+118)
              ├── LC-121 (Fallback chain — depends on LC-117+118+119)
              └── LC-122 (Tests — after adapter is stable)
```

## Implementation Order

1. **LC-114** — Account setup. Do this first. Nothing works without the key.
2. **LC-115** — Config changes. 10 minutes of work.
3. **LC-116** — `GoogleCloudTTSAdapter`. The core deliverable. ~100 lines.
4. **LC-117** — Wire `WordAudioService`. One injection swap.
5. **LC-118** — Wire `StoryAudioService`. One injection swap.
6. **LC-119** — Wire `AiController.tts`. One injection swap.
7. **LC-120** — SSML improvements. New quality enhancement.
8. **LC-121** — Fallback chain. Safety net.
9. **LC-122** — Tests.

---

## Rate Limit Comparison: Before vs After

| Provider | Use | Before | After |
|---|---|---|---|
| Gemini TTS (`gemini-2.5-flash-preview-tts`) | All TTS | 3 RPM | Fallback only |
| Google Cloud TTS (`de-DE-Neural2-B`) | All TTS | Not in use | Primary — **no RPM cap**, 1M chars/month free |
| Groq Whisper (`whisper-large-v3-turbo`) | Karaoke timestamps | Not in use (was OpenAI Whisper paid) | **2,000 req/day free** |
| OpenAI Whisper (`whisper-1`) | Karaoke timestamps | Paid per request | Replaced by Groq (LC-100) |

After this epic: zero paid API calls for audio in a normal month. Zero RPM limits blocking pronunciation or story playback.

---

## Improvements to Existing Audio Service

Beyond the provider swap, this epic introduces two improvements worth noting:

**1. SSML pronunciation quality (LC-120)** — Gemini TTS had no SSML support at all. Google Cloud TTS fully supports it. The `SsmlBuilder` adds controlled speaking rate (0.85× for single words, 0.92× for stories) which is meaningful for language learners who need to catch individual phonemes. This is a net new capability that did not exist before.

**2. Character-level quota monitoring** — `TTSSpeechResponse.characterCount` is returned from every GCTTS call. `WordAudioService.generateAndPersist()` can accumulate these counts for the analytics service (LC-WA16) to show monthly character consumption vs the 1M free tier. This gives visibility into quota usage before it becomes a problem.
