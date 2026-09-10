import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  WordDictionaryEntry,
  RawWordInput,
  DictionaryResolveResult,
  DictionaryBatchResolveResult,
  EnrichedWordInput,
  ExampleSentence,
} from '@lingua-card/shared/domain';
import { WordDictionaryRepository } from './word-dictionary.repository';
import { WordDictionaryEntity } from './word-dictionary.entity';
import { normalizeLemma } from './normalize-lemma';
import { WordEnrichService } from '../import/word-enrich.service';
import { WordAudioService } from '../word-audio/word-audio.service';
import { LegacyVocabularyProjectionService } from '../vocabulary/services/legacy-vocabulary-projection.service';
import { legacyDictionaryEntryToProjectionInput } from './legacy-vocabulary.mapper';

const BATCH_SIZE = 10;
const INTER_BATCH_DELAY_MS = 3_500;

// Normalise loose language codes to BCP-47 tags stored in the dictionary.
// Callers (image import, add-word-sheet) send 'de'/'en'; internal paths send 'de-DE'/'en'.
function normaliseLang(lang: string): string {
  if (lang === 'de') return 'de-DE';
  if (lang === 'en') return 'en';
  return lang;
}

@Injectable()
export class WordDictionaryService {
  private readonly logger = new Logger(WordDictionaryService.name);
  private readonly inflight = new Map<string, Promise<WordDictionaryEntity>>();

  private _totalRequested = 0;
  private _totalReused = 0;
  private _totalEnriched = 0;
  private _tokensSaved = 0;

  constructor(
    private readonly repo: WordDictionaryRepository,
    private readonly enrich: WordEnrichService,
    private readonly wordAudio: WordAudioService,
    private readonly vocabularyProjection: LegacyVocabularyProjectionService,
  ) {}

  async lookup(
    text: string,
    article: string | null = null,
    targetLang = 'de-DE',
    nativeLang = 'en',
  ): Promise<WordDictionaryEntry | null> {
    const key = normalizeLemma(text, article);
    const row = await this.repo.findByKey(key, normaliseLang(targetLang), normaliseLang(nativeLang));
    return row ? this.toModel(row) : null;
  }

  async resolve(
    raw: RawWordInput,
    targetLang = 'de-DE',
    nativeLang = 'en',
  ): Promise<DictionaryResolveResult> {
    targetLang = normaliseLang(targetLang);
    nativeLang = normaliseLang(nativeLang);
    const key = normalizeLemma(raw.back, raw.article);
    const hit = await this.repo.findByKey(key, targetLang, nativeLang);
    if (hit) {
      await this.projectToMultilingualVocabulary(hit);
      return { entry: this.toModel(hit), reused: true };
    }

    const inflightKey = `${targetLang}:${nativeLang}:${key}`;
    const running = this.inflight.get(inflightKey);
    if (running) {
      const entity = await running;
      await this.projectToMultilingualVocabulary(entity);
      return { entry: this.toModel(entity), reused: true };
    }

    const gen = this.enrichAndPersistContent(raw, key, targetLang, nativeLang);
    this.inflight.set(inflightKey, gen);
    try {
      const entity = await gen;
      await this.linkAudioForAll([entity], targetLang);
      await this.projectToMultilingualVocabulary(entity);
      return { entry: this.toModel(entity), reused: false };
    } finally {
      this.inflight.delete(inflightKey);
    }
  }

  /**
   * Persist pre-enriched lexical content without invoking a speech provider.
   */
  async persistEnrichedContent(
    word: EnrichedWordInput,
    targetLang = 'de-DE',
    nativeLang = 'en',
  ): Promise<WordDictionaryEntity> {
    targetLang = normaliseLang(targetLang);
    nativeLang = normaliseLang(nativeLang);
    const key = normalizeLemma(word.back, word.article);

    const existing = await this.repo.findByKey(key, targetLang, nativeLang);
    if (existing) {
      await this.projectToMultilingualVocabulary(existing);
      return existing;
    }

    const examples: ExampleSentence[] = (word.examples ?? []).map(e => ({
      id: randomUUID(),
      target: e.target,
      native: e.native,
    }));

    const entity = this.repo.create({
      id: randomUUID(),
      lemmaKey: key,
      targetLang,
      nativeLang,
      displayText: word.back,
      article: word.article,
      gender: this.articleToGender(word.article),
      translation: word.front,
      wordType: word.wordType ?? (word.article ? 'noun' : 'other'),
      phonetic: word.phonetic ?? null,
      cefrLevel: word.cefrLevel ?? null,
      categoryName: word.categoryName ?? 'Other',
      examples,
      synonyms: (word.synonyms ?? []).map(s => ({
        word: s.word,
        article: (s.article ?? null) as 'der' | 'die' | 'das' | null,
        translation: s.translation,
        example: s.example ?? '',
        exampleNative: s.exampleNative ?? '',
      })),
      plurals: word.plural ? [word.plural] : [],
      wordAudioId: null,
      source: 'admin',
      model: null,
    });

    const saved = await this.repo.upsertOnConflict(entity);
    await this.projectToMultilingualVocabulary(saved);
    return saved;
  }

  /**
   * Compatibility operation for callers that still require immediate headword audio.
   */
  async persistEnriched(
    word: EnrichedWordInput,
    targetLang = 'de-DE',
    nativeLang = 'en',
  ): Promise<WordDictionaryEntity> {
    const entity = await this.persistEnrichedContent(word, targetLang, nativeLang);
    if (entity.wordAudioId) return entity;

    const audio = await this.wordAudio.resolve(
      word.article ? `${word.article} ${word.back}` : word.back,
      normaliseLang(targetLang),
    );
    if (!audio.wordAudio.id) return entity;

    entity.wordAudioId = audio.wordAudio.id;
    return this.repo.save(entity);
  }

  /** Pure DB read — never calls AI. Returns only words already in the dictionary. */
  async batchCheck(
    raws: RawWordInput[],
    targetLang = 'de-DE',
    nativeLang = 'en',
  ): Promise<WordDictionaryEntry[]> {
    targetLang = normaliseLang(targetLang);
    nativeLang = normaliseLang(nativeLang);
    if (!raws.length) return [];
    const keys = raws.map(r => normalizeLemma(r.back, r.article));
    const existing = await this.repo.findByKeys(keys, targetLang, nativeLang);
    return keys
      .map(k => existing.get(k))
      .filter((e): e is WordDictionaryEntity => e !== undefined)
      .map(e => this.toModel(e));
  }

  async batchResolve(
    raws: RawWordInput[],
    targetLang = 'de-DE',
    nativeLang = 'en',
  ): Promise<DictionaryBatchResolveResult> {
    return this.resolveBatch(raws, targetLang, nativeLang, true);
  }

  /** Resolve lexical content without requesting or generating speech audio. */
  async batchResolveContent(
    raws: RawWordInput[],
    targetLang = 'de-DE',
    nativeLang = 'en',
  ): Promise<DictionaryBatchResolveResult> {
    return this.resolveBatch(raws, targetLang, nativeLang, false);
  }

  private async resolveBatch(
    raws: RawWordInput[],
    targetLang: string,
    nativeLang: string,
    prepareAudio: boolean,
  ): Promise<DictionaryBatchResolveResult> {
    targetLang = normaliseLang(targetLang);
    nativeLang = normaliseLang(nativeLang);
    if (!raws.length) return { entries: [], reused: 0, enriched: 0 };

    const keys = raws.map(r => normalizeLemma(r.back, r.article));
    const existing = await this.repo.findByKeys(keys, targetLang, nativeLang);

    const hits: WordDictionaryEntity[] = [];
    const misses: Array<{ raw: RawWordInput; key: string; idx: number }> = [];

    for (let idx = 0; idx < raws.length; idx++) {
      const raw = raws[idx];
      const key = keys[idx];
      const row = existing.get(key);
      if (row) {
        hits.push(row);
      } else {
        misses.push({ raw, key, idx });
      }
    }

    // Dedup misses by key — if a batch contains the same word twice, enrich only once
    const seenMissKeys = new Set<string>();
    const dedupedMisses = misses.filter(m => {
      if (seenMissKeys.has(m.key)) return false;
      seenMissKeys.add(m.key);
      return true;
    });

    const enrichedEntities = dedupedMisses.length
      ? await this.enrichBatchOnce(dedupedMisses, targetLang, nativeLang)
      : [];

    if (prepareAudio) {
      await this.linkAudioForAll([...hits, ...enrichedEntities], targetLang);
    }
    await this.vocabularyProjection.projectMany(
      [...hits, ...enrichedEntities].map(entity => ({
        input: legacyDictionaryEntryToProjectionInput(entity),
        legacyDictionaryWordId: entity.id,
      })),
    );

    const entityByKey = new Map<string, WordDictionaryEntity>();
    for (const e of hits) entityByKey.set(e.lemmaKey, e);
    for (const e of enrichedEntities) entityByKey.set(e.lemmaKey, e);

    const entries = keys.map(k => {
      const entity = entityByKey.get(k);
      return entity ? this.toModel(entity) : null;
    }).filter((e): e is WordDictionaryEntry => e !== null);

    this._totalRequested += raws.length;
    this._totalReused += hits.length;
    this._totalEnriched += enrichedEntities.length;
    this._tokensSaved += hits.length * 10;

    this.logger.log(
      `${prepareAudio ? 'batchResolve' : 'batchResolveContent'}: ` +
      `${hits.length} reused, ${enrichedEntities.length} enriched, ` +
      `tokens saved ≈ ${hits.length * 10}`,
    );

    return { entries, reused: hits.length, enriched: enrichedEntities.length };
  }

  private async enrichAndPersistContent(
    raw: RawWordInput,
    key: string,
    targetLang: string,
    nativeLang: string,
  ): Promise<WordDictionaryEntity> {
    const result = await this.enrich.enrichRaw(raw, targetLang, nativeLang);
    const examples: ExampleSentence[] = result.exampleTarget
      ? [{ id: randomUUID(), target: result.exampleTarget, native: result.exampleNative }]
      : [];

    const entity = this.repo.create({
      id: randomUUID(),
      lemmaKey: key,
      targetLang,
      nativeLang,
      displayText: result.back,
      article: (result.article as 'der' | 'die' | 'das' | null) ?? null,
      gender: this.articleToGender((result.article as 'der' | 'die' | 'das' | null) ?? null),
      translation: result.front,
      wordType: result.article ? 'noun' : 'other',
      categoryName: result.categoryName,
      examples,
      synonyms: result.synonyms ?? [],
      plurals: result.plural ? [result.plural] : [],
      wordAudioId: null,
      source: 'ai-enrich',
      model: result.model ?? null,
    });

    return this.repo.upsertOnConflict(entity);
  }

  private async enrichBatchOnce(
    misses: Array<{ raw: RawWordInput; key: string; idx: number }>,
    targetLang: string,
    nativeLang: string,
  ): Promise<WordDictionaryEntity[]> {
    const chunks = this.chunk(misses, BATCH_SIZE);
    const results: WordDictionaryEntity[] = [];

    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) await this.sleep(INTER_BATCH_DELAY_MS);
      const chunk = chunks[i];
      const settled = await Promise.allSettled(
        chunk.map(({ raw, key }) => this.enrichAndPersistContent(raw, key, targetLang, nativeLang)),
      );
      for (const r of settled) {
        if (r.status === 'fulfilled') results.push(r.value);
        else this.logger.error('enrichAndPersist failed', r.reason);
      }
    }
    return results;
  }

  private async linkAudioForAll(entities: WordDictionaryEntity[], targetLang: string): Promise<void> {
    const needsAudio = entities.filter(e => !e.wordAudioId);
    if (!needsAudio.length) return;

    await Promise.allSettled(needsAudio.map(async e => {
      const audio = await this.wordAudio.resolve(
        e.article ? `${e.article} ${e.displayText}` : e.displayText,
        targetLang,
      );
      e.wordAudioId = audio.wordAudio.id;
      await this.repo.save(e);
    }));
  }

  private toModel(e: WordDictionaryEntity): WordDictionaryEntry {
    return {
      id: e.id,
      lemmaKey: e.lemmaKey,
      displayText: e.displayText,
      article: e.article as 'der' | 'die' | 'das' | null,
      gender: e.gender,
      translation: e.translation,
      wordType: e.wordType,
      phonetic: e.phonetic,
      cefrLevel: e.cefrLevel,
      categoryName: e.categoryName,
      examples: e.examples,
      synonyms: e.synonyms,
      plurals: e.plurals,
      wordAudioId: e.wordAudioId,
      targetLang: e.targetLang,
      nativeLang: e.nativeLang,
      source: e.source,
      model: e.model,
      enrichedAt: e.enrichedAt.toISOString(),
    };
  }

  private projectToMultilingualVocabulary(entity: WordDictionaryEntity): Promise<void> {
    return this.vocabularyProjection
      .project(legacyDictionaryEntryToProjectionInput(entity), entity.id)
      .then(() => undefined);
  }

  getStats(): { totalRequested: number; totalReused: number; totalEnriched: number; cacheHitRate: number; tokensSaved: number; dictionarySize?: number; note: string } {
    const cacheHitRate = this._totalRequested > 0
      ? Math.round((this._totalReused / this._totalRequested) * 10000) / 100
      : 0;
    return {
      totalRequested: this._totalRequested,
      totalReused: this._totalReused,
      totalEnriched: this._totalEnriched,
      cacheHitRate,
      tokensSaved: this._tokensSaved,
      note: 'In-memory counters since last server restart. dictionarySize reflects persistent DB count.',
    };
  }

  async getStatsWithSize(): Promise<ReturnType<typeof this.getStats>> {
    const count = await this.repo.countAll();
    return { ...this.getStats(), dictionarySize: count };
  }

  private articleToGender(article: 'der' | 'die' | 'das' | null): 'masculine' | 'feminine' | 'neuter' | null {
    if (article === 'der') return 'masculine';
    if (article === 'die') return 'feminine';
    if (article === 'das') return 'neuter';
    return null;
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
