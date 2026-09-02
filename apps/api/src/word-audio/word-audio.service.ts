import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  WordAudio,
  WordAudioResolveRequest,
  WordAudioResolveResponse,
  WordAudioBatchResolveResponse,
} from '@lingua-card/shared/domain';
import { GoogleCloudTTSAdapter } from '../ai/providers/google-cloud-tts.adapter';
import { GeminiAdapter } from '../ai/providers/gemini.adapter';
import { StorageService } from '../storage/storage.service';
import { WordAudioRepository } from './word-audio.repository';
import { WordAudioEntity } from './word-audio.entity';
import { normalizeForAudio, audioStorageHash } from './normalize';
import { buildWordSsml } from './ssml-builder';
import { audioContentTypeFor, audioExtFor } from '../common/audio/audio-format';
import { LegacySpeechAssetProjectionService } from '../vocabulary/services/legacy-speech-asset-projection.service';

const BATCH_CONCURRENCY = 5;

// How long to wait before retrying a previously-failed generation.
// Prevents a consistently-failing word from hammering the TTS API on every tap.
const FAILED_RETRY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readNumber(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) return undefined;
  const candidate = value[key];
  return typeof candidate === 'number' ? candidate : undefined;
}

function readNestedNumber(value: unknown, parentKey: string, key: string): number | undefined {
  if (!isRecord(value)) return undefined;
  return readNumber(value[parentKey], key);
}

function readString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const candidate = value[key];
  return typeof candidate === 'string' ? candidate : undefined;
}

@Injectable()
export class WordAudioService {
  private readonly logger = new Logger(WordAudioService.name);

  // Prevents duplicate TTS generation when concurrent requests arrive for the same word.
  private readonly inflightGenerations = new Map<string, Promise<WordAudioEntity>>();

  constructor(
    private readonly repo: WordAudioRepository,
    private readonly tts: GoogleCloudTTSAdapter,
    private readonly gemini: GeminiAdapter,
    private readonly storage: StorageService,
    private readonly speechAssetProjection: LegacySpeechAssetProjectionService,
  ) {}

  async resolve(
    text: string,
    language = 'de-DE',
    opts: { generate?: boolean } = {},
  ): Promise<WordAudioResolveResponse> {
    const generate = opts.generate ?? true;
    const normalizedText = normalizeForAudio(text, language);
    const inflightKey    = `${language}:${normalizedText}`;

    // Check in-flight map FIRST — before any DB query.
    // This closes the race window where two concurrent requests both see no DB
    // row, then both attempt to insert and one hits the UNIQUE constraint.
    if (this.inflightGenerations.has(inflightKey)) {
      const entity = await this.inflightGenerations.get(inflightKey)!;
      await this.projectToSpeechAsset(entity);
      return { wordAudio: this.toModel(entity), cached: true };
    }

    const existing = await this.repo.findByNormalizedText(normalizedText, language);

    if (existing?.status === 'ready') {
      const available = await this.verifyReadyAsset(existing);
      if (available) {
        await this.projectToSpeechAsset(available);
        return { wordAudio: this.toModel(available), cached: true };
      }
    }

    // Cache-read-only mode (non-Pro callers): never trigger generation. Return the
    // ready asset if it exists (handled above); otherwise an empty model so the
    // client falls back to Web Speech. Do NOT create a row or mark it failed — a
    // Pro user (or a server seed) must still be able to generate it later.
    if (!generate) {
      return {
        wordAudio: this.toModel(existing ?? this._emptyModel(normalizedText, text, language)),
        cached: false,
      };
    }

    // If the last generation failed recently, return the failed record with a
    // retryAfterMs hint instead of hammering the TTS API again immediately.
    if (existing?.status === 'failed' && existing.failedAt) {
      const msSinceFailed = Date.now() - existing.failedAt.getTime();
      if (msSinceFailed < FAILED_RETRY_COOLDOWN_MS) {
        const retryAfterMs = FAILED_RETRY_COOLDOWN_MS - msSinceFailed;
        return { wordAudio: this.toModel(existing), cached: false, retryAfterMs };
      }
      // Cooldown elapsed — reset to pending and retry
      existing.status  = 'pending';
      existing.failedAt = null;
      await this.repo.save(existing);
    }

    const generation = this.generateAndPersist(normalizedText, text, language, existing ?? undefined);
    this.inflightGenerations.set(inflightKey, generation);
    try {
      const entity = await generation;
      await this.projectToSpeechAsset(entity);
      return { wordAudio: this.toModel(entity), cached: false };
    } catch (error: unknown) {
      // Return a graceful 200 with the pending entity so the client can fall back.
      // Include retryAfterMs so the client knows when to try again.
      const pending = await this.repo.findByNormalizedText(normalizedText, language);
      const retryAfterMs =
        readNestedNumber(error, 'response', 'retryAfterMs') ?? readNumber(error, 'retryAfterMs');
      return {
        wordAudio: this.toModel(pending ?? this._emptyModel(normalizedText, text, language)),
        cached: false,
        retryAfterMs,
      };
    } finally {
      this.inflightGenerations.delete(inflightKey);
    }
  }

  private _emptyModel(normalizedText: string, displayText: string, language: string): WordAudioEntity {
    const e = new WordAudioEntity();
    e.id = '';
    e.normalizedText = normalizedText;
    e.displayText = displayText;
    e.language = language;
    e.audioUrl = null;
    e.storagePath = null;
    e.durationMs = 0;
    e.status = 'pending';
    e.failedAt = null;
    e.createdAt = new Date();
    e.updatedAt = new Date();
    return e;
  }

  // Maximum number of unique words processed in a single DB query + generation pass.
  // Large collections are chunked here so the service — not callers — controls batch size.
  private static readonly BATCH_MAX = 100;

  async batchResolve(
    words: WordAudioResolveRequest[],
    opts: { generate?: boolean } = {},
  ): Promise<WordAudioBatchResolveResponse> {
    const generate = opts.generate ?? true;
    // If callers send more than BATCH_MAX words, process them in sequential passes
    // and merge the results, so no words are silently dropped.
    if (words.length > WordAudioService.BATCH_MAX) {
      const merged: WordAudioBatchResolveResponse = { results: [], generated: 0, reused: 0 };
      for (let i = 0; i < words.length; i += WordAudioService.BATCH_MAX) {
        const chunk = words.slice(i, i + WordAudioService.BATCH_MAX);
        const part  = await this.batchResolve(chunk, opts);
        merged.results.push(...part.results);
        merged.generated += part.generated;
        merged.reused    += part.reused;
      }
      return merged;
    }

    const DEFAULT_LANG = 'de-DE';
    const normalized = words.map(w => ({
      original: w,
      normalizedText: normalizeForAudio(w.text, w.language ?? DEFAULT_LANG),
      language: w.language ?? DEFAULT_LANG,
    }));

    // Group by language so each DB query uses the correct language filter.
    const byLanguage = new Map<string, string[]>();
    for (const n of normalized) {
      const group = byLanguage.get(n.language) ?? [];
      group.push(n.normalizedText);
      byLanguage.set(n.language, group);
    }
    const existingArrays = await Promise.all(
      [...byLanguage.entries()].map(([lang, texts]) =>
        this.repo.findByNormalizedTexts(texts, lang),
      ),
    );
    // Key: `language:normalizedText` to avoid collisions across languages.
    const existingMap = new Map(
      existingArrays.flat().map(e => [`${e.language}:${e.normalizedText}`, e]),
    );
    const missingReadyAssets = new Set<string>();
    await Promise.all([...existingMap.entries()].map(async ([key, entity]) => {
      if (entity.status !== 'ready') return;
      if (!await this.verifyReadyAsset(entity)) missingReadyAssets.add(key);
    }));

    const resultMap = new Map<string, WordAudioResolveResponse>();
    let generated = 0;
    let reused = 0;

    // Cache-read-only mode (non-Pro): resolve everything from the existing rows we
    // already fetched — no per-word resolve() calls, no generation. Ready rows are
    // returned as cached; everything else gets an empty model (audioUrl null) so the
    // client falls back to Web Speech.
    if (!generate) {
      for (const n of normalized) {
        const e = existingMap.get(`${n.language}:${n.normalizedText}`);
        if (e?.status === 'ready' && !missingReadyAssets.has(`${n.language}:${n.normalizedText}`)) {
          resultMap.set(`${n.language}:${n.normalizedText}`, { wordAudio: this.toModel(e), cached: true });
          reused++;
        } else {
          resultMap.set(`${n.language}:${n.normalizedText}`, {
            wordAudio: this.toModel(e ?? this._emptyModel(n.normalizedText, n.original.text, n.language)),
            cached: false,
          });
        }
      }
      return { results: normalized.map(n => resultMap.get(`${n.language}:${n.normalizedText}`)!), generated: 0, reused };
    }

    // 'ready'   → return immediately, no generation needed
    // 'pending' → generation is already in-flight (another process or prior call);
    //             return the entity as-is so the client gets the audioUrl once it's ready.
    //             resolve() will deduplicate via the in-flight map when called for the same key.
    // 'failed'  → respect the cooldown, but let resolve() handle the retry logic.
    // absent    → must generate
    const needsGeneration = normalized.filter(n => {
      const e = existingMap.get(`${n.language}:${n.normalizedText}`);
      return !e || e.status === 'failed' || missingReadyAssets.has(`${n.language}:${n.normalizedText}`);
    });
    const alreadyHandled = normalized.filter(n => {
      const e = existingMap.get(`${n.language}:${n.normalizedText}`);
      return e
        && !missingReadyAssets.has(`${n.language}:${n.normalizedText}`)
        && (e.status === 'ready' || e.status === 'pending');
    });

    for (const n of alreadyHandled) {
      resultMap.set(`${n.language}:${n.normalizedText}`, { wordAudio: this.toModel(existingMap.get(`${n.language}:${n.normalizedText}`)!), cached: true });
      reused++;
    }

    // Generate missing/failed words in batches with concurrency limit
    for (let i = 0; i < needsGeneration.length; i += BATCH_CONCURRENCY) {
      const chunk = needsGeneration.slice(i, i + BATCH_CONCURRENCY);
      const settled = await Promise.allSettled(
        chunk.map(n => this.resolve(n.original.text, n.language, opts)),
      );
      for (let resultIndex = 0; resultIndex < settled.length; resultIndex++) {
        const result = settled[resultIndex];
        const normalizedWord = chunk[resultIndex];
        const key = `${normalizedWord.language}:${normalizedWord.normalizedText}`;
        if (result.status === 'fulfilled') {
          resultMap.set(key, result.value);
          if (!result.value.cached) generated++;
          else reused++;
        } else {
          this.logger.warn(`Audio batch item failed for ${key}: ${readString(result.reason, 'message') ?? 'unknown error'}`);
          resultMap.set(key, {
            wordAudio: this.toModel(this._emptyModel(normalizedWord.normalizedText, normalizedWord.original.text, normalizedWord.language)),
            cached: false,
          });
        }
      }
    }

    return {
      results: normalized.map(n => resultMap.get(`${n.language}:${n.normalizedText}`)!),
      generated,
      reused,
    };
  }

  async findById(id: string): Promise<WordAudio | null> {
    const entity = await this.repo.findById(id);
    return entity ? this.toModel(entity) : null;
  }

  async findByText(text: string, language = 'de-DE'): Promise<WordAudio | null> {
    const normalizedText = normalizeForAudio(text, language);
    const entity = await this.repo.findByNormalizedText(normalizedText, language);
    return entity ? this.toModel(entity) : null;
  }

  private async generateSpeechWithFallback(
    displayText: string,
    language: string,
    ssml: boolean,
  ): Promise<{ audioBuffer: ArrayBuffer; durationMs: number; mimeType: string }> {
    try {
      const speech = await this.tts.generateSpeech({ text: displayText, language, ssml });
      return { audioBuffer: speech.audioBuffer, durationMs: speech.durationMs, mimeType: 'audio/mpeg' };
    } catch (primaryErr: unknown) {
      // ServiceUnavailableException from the adapter means the key is not configured —
      // this is a deployment config error, not a transient outage. Log loudly and re-throw
      // so the problem is visible rather than silently degrading to Gemini TTS indefinitely.
      if (primaryErr instanceof ServiceUnavailableException) {
        this.logger.error(
          'Google Cloud TTS is not configured (GOOGLE_CLOUD_TTS_KEY_BASE64 missing or invalid). ' +
          'Fix the environment variable — not falling back to Gemini for config errors.',
          primaryErr,
        );
        throw primaryErr;
      }

      // gRPC transient codes that warrant a Gemini fallback:
      //   4  = DEADLINE_EXCEEDED
      //   8  = RESOURCE_EXHAUSTED (quota)
      //   14 = UNAVAILABLE
      const transientGrpcCodes = new Set([4, 8, 14]);
      const errorCode = readNumber(primaryErr, 'code');
      const isTransient = errorCode !== undefined && transientGrpcCodes.has(errorCode);

      if (!isTransient) {
        this.logger.error(
          `Google Cloud TTS failed with non-transient error (code=${errorCode}): ${readString(primaryErr, 'message')}`,
          primaryErr,
        );
        throw primaryErr;
      }

      this.logger.warn(
        `Google Cloud TTS transient error (gRPC code=${errorCode}) — falling back to Gemini TTS`,
      );
    }

    const speech = await this.gemini.generateSpeech({ text: displayText, language });
    return { audioBuffer: speech.audioBuffer, durationMs: speech.durationMs, mimeType: speech.mimeType };
  }

  private async verifyReadyAsset(entity: WordAudioEntity): Promise<WordAudioEntity | null> {
    if (!entity.storagePath) return entity.audioUrl ? entity : null;

    const availableUrl = await this.storage.getUrlIfExists(entity.storagePath);
    if (!availableUrl) {
      this.logger.warn(
        `Cached audio object is missing from storage; regenerating ${entity.language}:${entity.normalizedText}`,
      );
      entity.status = 'pending';
      entity.audioUrl = null;
      entity.failedAt = null;
      await this.repo.save(entity);
      return null;
    }

    if (entity.audioUrl !== availableUrl) {
      entity.audioUrl = availableUrl;
      await this.repo.save(entity);
    }
    return entity;
  }

  private async generateAndPersist(
    normalizedText: string,
    displayText: string,
    language: string,
    existingEntity?: WordAudioEntity,
  ): Promise<WordAudioEntity> {
    const hash = audioStorageHash(normalizedText, language);

    let entity = existingEntity;
    if (!entity) {
      entity = this.repo.create({
        id: randomUUID(),
        normalizedText,
        displayText,
        language,
        status: 'pending',
        storagePath: `word-audio/${hash}.mp3`,
        audioUrl: null,
        durationMs: 0,
      });
      entity = await this.repo.save(entity);
    }

    // If the entity was previously left in 'pending' (e.g. after a server restart
    // mid-generation), the audio file may already be in storage. Recover without
    // calling TTS again — saves quota and avoids double-generation on restart.
    if (entity.storagePath) {
      const existingUrl = await this.storage.getUrlIfExists(entity.storagePath);
      if (existingUrl) {
        this.logger.debug(`Audio already in storage for "${displayText}" — recovering without TTS`);
        entity.audioUrl = existingUrl;
        entity.status   = 'ready';
        return await this.repo.save(entity);
      }
    }

    try {
      const speech = await this.generateSpeechWithFallback(buildWordSsml(displayText), language, true);
      const ext        = audioExtFor(speech.mimeType);
      const actualPath = `word-audio/${hash}.${ext}`;
      const audioUrl   = await this.storage.upload(
        Buffer.from(speech.audioBuffer),
        actualPath,
        audioContentTypeFor(speech.mimeType),
      );

      entity.audioUrl    = audioUrl;
      entity.storagePath = actualPath;
      entity.durationMs  = speech.durationMs;
      entity.status      = 'ready';
      return await this.repo.save(entity);
    } catch (error: unknown) {
      this.logger.warn(`TTS generation failed for "${displayText}":`, error);

      const is429 =
        readNumber(error, 'status') === 429 || readNestedNumber(error, 'response', 'statusCode') === 429;
      if (!is429) {
        entity.status    = 'failed';
        entity.failedAt  = new Date();
        await this.repo.save(entity);
      }
      throw error;
    }
  }

  private toModel(e: WordAudioEntity): WordAudio {
    return {
      id: e.id,
      normalizedText: e.normalizedText,
      displayText: e.displayText,
      language: e.language,
      audioUrl: e.audioUrl,
      storagePath: e.storagePath,
      durationMs: e.durationMs,
      status: e.status,
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
      updatedAt: e.updatedAt instanceof Date ? e.updatedAt.toISOString() : String(e.updatedAt),
    };
  }

  private projectToSpeechAsset(entity: WordAudioEntity): Promise<void> {
    return this.speechAssetProjection.project({
      language: entity.language,
      text: entity.displayText,
      audioUrl: entity.audioUrl,
      storagePath: entity.storagePath,
      durationMs: entity.durationMs,
      status: entity.status,
      failedAt: entity.failedAt,
    });
  }
}
