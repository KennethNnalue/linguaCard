import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  WordAudio,
  WordAudioResolveRequest,
  WordAudioResolveResponse,
  WordAudioBatchResolveResponse,
} from '@lingua-card/shared/domain';
import { GeminiAdapter } from '../ai/providers/gemini.adapter';
import { StorageService } from '../storage/storage.service';
import { WordAudioRepository } from './word-audio.repository';
import { WordAudioEntity } from './word-audio.entity';
import { normalizeForAudio, audioStorageHash } from './normalize';

const BATCH_CONCURRENCY = 5;

// How long to wait before retrying a previously-failed generation.
// Prevents a consistently-failing word from hammering the TTS API on every tap.
const FAILED_RETRY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class WordAudioService {
  private readonly logger = new Logger(WordAudioService.name);

  // Prevents duplicate TTS generation when concurrent requests arrive for the same word.
  private readonly inflightGenerations = new Map<string, Promise<WordAudioEntity>>();

  constructor(
    private readonly repo: WordAudioRepository,
    private readonly gemini: GeminiAdapter,
    private readonly storage: StorageService,
  ) {}

  async resolve(text: string, language = 'de-DE'): Promise<WordAudioResolveResponse> {
    const normalizedText = normalizeForAudio(text, language);

    const existing = await this.repo.findByNormalizedText(normalizedText, language);
    if (existing && existing.status === 'ready') {
      return { wordAudio: this.toModel(existing), cached: true };
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
      existing.status = 'pending';
      existing.failedAt = null;
      await this.repo.save(existing);
    }

    const inflightKey = `${language}:${normalizedText}`;
    if (this.inflightGenerations.has(inflightKey)) {
      const entity = await this.inflightGenerations.get(inflightKey)!;
      return { wordAudio: this.toModel(entity), cached: true };
    }

    const generation = this.generateAndPersist(normalizedText, text, language, existing ?? undefined);
    this.inflightGenerations.set(inflightKey, generation);
    try {
      const entity = await generation;
      return { wordAudio: this.toModel(entity), cached: false };
    } catch (err: any) {
      // Return a graceful 200 with the pending entity so the client can fall back.
      // Include retryAfterMs so the client knows when to try again.
      const pending = await this.repo.findByNormalizedText(normalizedText, language);
      const retryAfterMs: number | undefined = err?.response?.retryAfterMs ?? err?.retryAfterMs;
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

  async batchResolve(words: WordAudioResolveRequest[]): Promise<WordAudioBatchResolveResponse> {
    const language = 'de-DE';
    const normalized = words.map(w => ({
      original: w,
      normalizedText: normalizeForAudio(w.text, w.language ?? language),
      language: w.language ?? language,
    }));

    const allNormalized = normalized.map(n => n.normalizedText);
    const existing = await this.repo.findByNormalizedTexts(allNormalized, language);
    const existingMap = new Map(existing.map(e => [e.normalizedText, e]));

    const results: WordAudioResolveResponse[] = [];
    let generated = 0;
    let reused = 0;

    const missing = normalized.filter(n => {
      const e = existingMap.get(n.normalizedText);
      return !e || e.status !== 'ready';
    });
    const ready = normalized.filter(n => {
      const e = existingMap.get(n.normalizedText);
      return e && e.status === 'ready';
    });

    for (const n of ready) {
      results.push({ wordAudio: this.toModel(existingMap.get(n.normalizedText)!), cached: true });
      reused++;
    }

    // Generate missing words with concurrency limit
    for (let i = 0; i < missing.length; i += BATCH_CONCURRENCY) {
      const chunk = missing.slice(i, i + BATCH_CONCURRENCY);
      const settled = await Promise.allSettled(
        chunk.map(n => this.resolve(n.original.text, n.language)),
      );
      for (const result of settled) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
          if (!result.value.cached) generated++;
          else reused++;
        }
      }
    }

    return { results, generated, reused };
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

  private async generateAndPersist(
    normalizedText: string,
    displayText: string,
    language: string,
    existingEntity?: WordAudioEntity,
  ): Promise<WordAudioEntity> {
    const hash = audioStorageHash(normalizedText, language);
    const storagePath = `word-audio/${hash}.wav`;

    let entity = existingEntity;
    if (!entity) {
      entity = this.repo.create({
        id: randomUUID(),
        normalizedText,
        displayText,
        language,
        status: 'pending',
        storagePath,
        audioUrl: null,
        durationMs: 0,
      });
      entity = await this.repo.save(entity);
    }

    try {
      const speech = await this.gemini.generateSpeech({ text: displayText, language });
      const audioUrl = await this.storage.upload(
        Buffer.from(speech.audioBuffer),
        storagePath,
        'audio/wav',
      );

      entity.audioUrl = audioUrl;
      entity.durationMs = speech.durationMs;
      entity.status = 'ready';
      return await this.repo.save(entity);
    } catch (err: any) {
      this.logger.warn(`TTS generation failed for "${displayText}":`, err);

      // On 429, keep status 'pending' so it retries next time instead of staying failed.
      // On other errors, mark failed and stamp failedAt for the cooldown check in resolve().
      const is429 = err?.status === 429 || err?.response?.statusCode === 429;
      if (!is429) {
        entity.status = 'failed';
        entity.failedAt = new Date();
        await this.repo.save(entity);
      }
      // Attach retryAfterMs to the error so the controller can forward it
      // to the client via a Retry-After header.
      throw err;
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
}
