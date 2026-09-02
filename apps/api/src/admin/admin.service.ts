import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { PlatformCollectionEntity } from './platform-collection.entity';
import { PlatformCollectionWordEntity } from './platform-collection-word.entity';
import { PlatformStoryEntity } from '../platform-stories/platform-story.entity';
import { UserStoryProgressEntity } from '../platform-stories/user-story-progress.entity';
import { WordDictionaryEntity } from '../word-dictionary/word-dictionary.entity';
import { WordDictionaryService } from '../word-dictionary/word-dictionary.service';
import { WordAudioService } from '../word-audio/word-audio.service';
import { PlatformCollectionImportEntity } from './platform-collection-import.entity';
import { StoryAudioService } from '../stories/story-audio.service';
import { StorageService } from '../storage/storage.service';
import { LegacyDictionaryLexemeEntity } from '../vocabulary/entities/legacy-dictionary-lexeme.entity';
import { CollectionEntity } from '../collections/collection.entity';
import type {
  AdminImportCollectionDto,
  AdminImportCollectionResult,
  AdminImportCollectionJsonDto,
  AdminImportCollectionJsonResult,
  AdminImportStoryDto,
  AdminImportStoryResult,
  AdminPlatformCollectionListItem,
  AdminPlatformCollectionWordItem,
  AdminPlatformStoryListItem,
  AdminUpdatePlatformCollectionDto,
  StoryKeyword,
} from '@lingua-card/shared/domain';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(PlatformCollectionEntity)
    private readonly collectionRepo: Repository<PlatformCollectionEntity>,
    @InjectRepository(PlatformCollectionWordEntity)
    private readonly wordRepo: Repository<PlatformCollectionWordEntity>,
    @InjectRepository(PlatformStoryEntity)
    private readonly storyRepo: Repository<PlatformStoryEntity>,
    @InjectRepository(UserStoryProgressEntity)
    private readonly storyProgressRepo: Repository<UserStoryProgressEntity>,
    @InjectRepository(WordDictionaryEntity)
    private readonly dictRepo: Repository<WordDictionaryEntity>,
    @InjectRepository(PlatformCollectionImportEntity)
    private readonly importRepo: Repository<PlatformCollectionImportEntity>,
    @InjectRepository(LegacyDictionaryLexemeEntity)
    private readonly dictionaryLexemeRepo: Repository<LegacyDictionaryLexemeEntity>,
    private readonly dictionary: WordDictionaryService,
    private readonly wordAudio: WordAudioService,
    private readonly storyAudio: StoryAudioService,
    private readonly storage: StorageService,
  ) {}

  private readonly logger = new Logger(AdminService.name);

  /** Guard so two admins can't kick off overlapping backfills (wasted TTS spend). */
  private backfillRunning = false;

  /**
   * Kick off the published-collection audio backfill in the background and return
   * immediately, so the request never times out behind a proxy on a large library.
   * Progress + the final summary are logged. Returns `{ started: false }` if a
   * backfill is already in flight.
   */
  startBackfillPublishedCollectionAudio(): { started: boolean } {
    if (this.backfillRunning) return { started: false };
    this.backfillRunning = true;
    void this.backfillPublishedCollectionAudio()
      .then(r => this.logger.log(
        `Backfill complete: ${r.collections} collection(s), ${r.words} clips, ` +
        `${r.generated} generated, ${r.reused} reused.`,
      ))
      .catch(err => this.logger.error('Backfill failed', err))
      .finally(() => { this.backfillRunning = false; });
    return { started: true };
  }

  /**
   * Backfill: generate (and cache) HD audio for every word in every PUBLISHED
   * platform collection that doesn't already have it. New imports already seed
   * audio at import time ([collection-complete.service.ts]); this covers
   * collections published before that, or where generation previously failed.
   * Internal path → ungated (always generates), so the global cache is seeded for
   * all users (incl. free) to reuse. Idempotent: already-cached words are reused.
   */
  async backfillPublishedCollectionAudio(): Promise<{
    collections: number;
    words: number;
    generated: number;
    reused: number;
  }> {
    const collections = await this.collectionRepo.find({ where: { isPublished: true } });
    if (!collections.length) return { collections: 0, words: 0, generated: 0, reused: 0 };

    const wordRows = await this.wordRepo.find({
      where: { platformCollectionId: In(collections.map(c => c.id)) },
    });
    const dictIds = [...new Set(wordRows.map(w => w.dictionaryWordId))];
    if (!dictIds.length) return { collections: collections.length, words: 0, generated: 0, reused: 0 };

    const dictEntries = await this.dictRepo.findBy({ id: In(dictIds) });

    // Build deduped target-language audio items (headword + first example).
    const seen = new Set<string>();
    const items: { text: string; language: string }[] = [];
    for (const e of dictEntries) {
      if (!e.displayText?.trim()) continue;
      const word = (e.article ? `${e.article} ` : '') + e.displayText;
      for (const text of [word, e.examples?.[0]?.target]) {
        if (!text?.trim() || seen.has(text)) continue;
        seen.add(text);
        items.push({ text, language: 'de-DE' });
      }
    }

    this.logger.log(
      `Backfilling audio for ${collections.length} published collection(s), ${items.length} unique clips…`,
    );
    const result = await this.wordAudio.batchResolve(items);
    return {
      collections: collections.length,
      words: items.length,
      generated: result.generated,
      reused: result.reused,
    };
  }

  async importCollectionJson(dto: AdminImportCollectionJsonDto): Promise<AdminImportCollectionJsonResult> {
    this.validateJsonCollection(dto);
    const collectionId = crypto.randomUUID();
    let inserted = 0;
    let reused = 0;
    let audioLinked = 0;

    const wordRows: PlatformCollectionWordEntity[] = [];

    for (const word of dto.words) {
      const before = await this.dictionary.lookup(word.back, word.article, 'de-DE', 'en');
      const entity = await this.dictionary.persistEnriched(word, 'de-DE', 'en');
      if (before) {
        reused++;
      } else {
        inserted++;
        if (entity.wordAudioId) audioLinked++;
      }
      const mapping = await this.dictionaryLexemeRepo.findOneBy({ dictionaryWordId: entity.id });
      if (!mapping) {
        throw new ConflictException(`Vocabulary projection failed for words[${wordRows.length}].back (${word.back})`);
      }
      wordRows.push(
        this.wordRepo.create({
          id: randomUUID(),
          platformCollectionId: collectionId,
          dictionaryWordId: entity.id,
          lexemeId: mapping.lexemeId,
          position: wordRows.length,
        }),
      );
    }

    const collection = this.collectionRepo.create({
      id: collectionId,
      title: dto.title,
      emoji: null,
      level: dto.level,
      topic: dto.topic ?? dto.title,
      isPublished: false,
      wordCount: wordRows.length,
    });
    await this.collectionRepo.manager.transaction(async manager => {
      await manager.save(PlatformCollectionEntity, collection);
      await manager.save(PlatformCollectionWordEntity, wordRows);
    });

    return { collectionId, title: dto.title, inserted, reused, audioLinked };
  }

  async importCollection(dto: AdminImportCollectionDto): Promise<AdminImportCollectionResult> {
    if (!dto.title?.trim() || !dto.level || !Array.isArray(dto.words) || dto.words.length === 0) {
      throw new BadRequestException('Title, level, and at least one word are required');
    }
    const batchResult = await this.dictionary.batchResolve(dto.words, 'de-DE', 'en');

    const mappings = await this.dictionaryLexemeRepo.findBy({
      dictionaryWordId: In(batchResult.entries.map(entry => entry.id)),
    });
    const lexemeIdByDictionaryId = new Map(mappings.map(mapping => [mapping.dictionaryWordId, mapping.lexemeId]));
    const unresolvedEntry = batchResult.entries.find(entry => !lexemeIdByDictionaryId.has(entry.id));
    if (unresolvedEntry) {
      throw new ConflictException(`Vocabulary projection failed for ${unresolvedEntry.displayText}`);
    }

    const collectionId = crypto.randomUUID();
    const collection = this.collectionRepo.create({
      id: collectionId,
      title: dto.title,
      emoji: null,
      level: dto.level,
      topic: dto.topic ?? dto.title,
      isPublished: false,
      wordCount: batchResult.entries.length,
    });
    const wordRows = batchResult.entries.map((entry, i) =>
      this.wordRepo.create({
        id: crypto.randomUUID(),
        platformCollectionId: collectionId,
        dictionaryWordId: entry.id,
        lexemeId: lexemeIdByDictionaryId.get(entry.id),
        position: i,
      }),
    );
    await this.collectionRepo.manager.transaction(async manager => {
      await manager.save(PlatformCollectionEntity, collection);
      await manager.save(PlatformCollectionWordEntity, wordRows);
    });

    return {
      collectionId,
      title: dto.title,
      created: batchResult.entries.length,
      reused: batchResult.reused,
      enriched: batchResult.enriched,
    };
  }

  async importStory(dto: AdminImportStoryDto): Promise<AdminImportStoryResult> {
    const { story } = dto;
    const nativeLang = story.nativeLang ?? 'en';

    // Map story keywords through dictionary (lookup only — no enrichment for admin import).
    // Index-aligned with story.keywords; null = dictionary miss (keep the JSON-supplied values).
    const keywordEntries = await Promise.all(
      story.keywords.map(kw =>
        this.dictionary.lookup(kw.germanBase, kw.article, 'de-DE', nativeLang),
      ),
    );

    // Store in the same domain shapes as user-generated stories so the reader,
    // player and adopt-copy all work unchanged on platform stories.
    const sentences: PlatformStoryEntity['sentences'] = story.sentences.map((s, i) => ({
      index: i,
      german: s.german,
      native: s.native,
      vocabWordIds: [],
    }));

    // Prefer canonical dictionary values (translation/article/wordType) so platform
    // keywords share entries + audio with collections and user cards; fall back to
    // the JSON-supplied keyword on a dictionary miss.
    const keywords: PlatformStoryEntity['keywords'] = story.keywords.map((kw, i) => {
      const entry = keywordEntries[i];
      return {
        cardId: null,
        german: kw.article ? `${kw.article} ${kw.germanBase}` : kw.germanBase,
        germanBase: kw.germanBase,
        translation: entry?.translation ?? kw.translation,
        article: (entry?.article ?? kw.article) as StoryKeyword['article'],
        wordType: (entry?.wordType as StoryKeyword['wordType']) ?? kw.wordType,
        level: kw.level,
      };
    });

    const quizQuestions: PlatformStoryEntity['quizQuestions'] = (story.quizQuestions ?? []).map((q, i) => ({
      id: `q-${i}`,
      sentenceTemplate: q.sentenceTemplate,
      correctAnswer: q.correctAnswer,
      distractors: q.distractors,
      audioSentence: q.audioSentence,
      hint: q.hint,
    }));

    const grammarNotes: PlatformStoryEntity['grammarNotes'] = (story.grammarNotes ?? []).map((g, i) => ({
      id: `g-${i}`,
      title: g.title,
      exampleDe: g.exampleDe,
      exampleNative: g.exampleNative,
      description: g.description,
      conjugationTable: g.conjugationTable,
      additionalExamples: g.additionalExamples ?? [],
    }));

    const storyId = crypto.randomUUID();
    const totalWords = story.sentences.reduce((acc, s) => acc + s.german.split(/\s+/).length, 0);
    const bodyDe = story.sentences.map(s => s.german).join(' ');

    // Length is independent of CEFR level. Preserve historical behavior when the
    // import JSON omits it: short for A1/A2, medium otherwise.
    const lengthType = story.length ?? (story.level === 'A1' || story.level === 'A2' ? 'short' : 'medium');

    // Optionally generate narration audio + word timestamps via TTS at import time.
    let audioUrl: string | null = null;
    let audioDurationMs = 0;
    let wordTimestamps: PlatformStoryEntity['wordTimestamps'] = [];
    if (dto.generateAudio) {
      try {
        const result = await this.storyAudio.generateAudioWithTimestamps(bodyDe, storyId);
        audioUrl = result.audioUrl;
        audioDurationMs = result.durationMs;
        wordTimestamps = result.timestamps;
      } catch (err) {
        this.logger.error(`Audio generation failed for platform story ${storyId} — saving without audio`, err);
      }
    }

    const entity = Object.assign(new PlatformStoryEntity(), {
      id: storyId,
      title: story.title,
      titleTranslation: story.titleTranslation,
      bodyDe,
      bodyNative: story.sentences.map(s => s.native).join(' '),
      nativeLang,
      sentences,
      keywords,
      wordTimestamps,
      quizQuestions,
      grammarNotes,
      audioUrl,
      audioDurationMs,
      coverImageUrl: null,
      level: story.level as string,
      category: story.topic as string,
      topics: [story.topic],
      isFiction: dto.isFiction ?? true,
      isPremium: false,
      wordCount: totalWords,
      lengthType,
      estimatedReadMinutes: Math.max(1, Math.round(totalWords / 80)),
      readCount: 0,
      isPublished: false,
      platformCollectionId: dto.platformCollectionId,
    });
    await this.storyRepo.save(entity);

    return {
      storyId,
      title: story.title,
      sentenceCount: story.sentences.length,
      keywordsResolved: keywordEntries.filter(e => e !== null).length,
      audioGenerated: audioUrl !== null,
    };
  }

  /**
   * Re-generate (or first-time generate) narration audio + word timestamps for an
   * already-imported platform story. Used when audio was skipped at import time or
   * the original TTS attempt failed.
   */
  async regenerateStoryAudio(id: string): Promise<AdminImportStoryResult> {
    const entity = await this.storyRepo.findOneBy({ id });
    if (!entity) throw new NotFoundException(`Platform story ${id} not found`);

    // Track the outcome explicitly: a story that already had audio keeps its old
    // URL on failure, so `entity.audioUrl !== null` would falsely report success.
    let regenerated = false;
    try {
      const result = await this.storyAudio.generateAudioWithTimestamps(entity.bodyDe, entity.id);
      entity.audioUrl = result.audioUrl;
      entity.audioDurationMs = result.durationMs;
      entity.wordTimestamps = result.timestamps;
      await this.storyRepo.save(entity);
      regenerated = true;
    } catch (err) {
      this.logger.error(`Audio re-generation failed for platform story ${id}`, err);
    }

    return {
      storyId: entity.id,
      title: entity.title,
      sentenceCount: entity.sentences?.length ?? 0,
      keywordsResolved: entity.keywords?.length ?? 0,
      audioGenerated: regenerated,
    };
  }

  async listCollections(): Promise<AdminPlatformCollectionListItem[]> {
    const collections = await this.collectionRepo.find({ order: { createdAt: 'DESC' } });
    const ids = collections.map(c => c.id);
    if (!ids.length) return [];

    const reuseCounts: Array<{ platformCollectionId: string; reused: number }> =
      await this.wordRepo.manager.query(
        `SELECT pcw."platformCollectionId",
                COUNT(DISTINCT wd."id")::int AS reused
         FROM platform_collection_words pcw
         JOIN word_dictionary wd ON wd.id = pcw."dictionaryWordId"
         WHERE pcw."platformCollectionId" = ANY($1::text[])
         GROUP BY pcw."platformCollectionId"`,
        [ids],
      );
    const reuseMap = new Map(reuseCounts.map(r => [r.platformCollectionId, r.reused]));
    const imports = await this.importRepo.findBy({ collectionId: In(ids) });
    const importStatus = new Map(imports.map(record => [record.collectionId, record.status]));

    return collections.map(c => ({
      id: c.id,
      title: c.title,
      emoji: c.emoji,
      coverImageUrl: c.coverImageUrl,
      level: c.level,
      topic: c.topic,
      sourceLanguage: c.sourceLanguage as AdminPlatformCollectionListItem['sourceLanguage'],
      targetLanguage: c.targetLanguage as AdminPlatformCollectionListItem['targetLanguage'],
      status: c.isPublished ? 'published' : (importStatus.get(c.id) ?? c.status) as AdminPlatformCollectionListItem['status'],
      wordCount: c.wordCount,
      dictionaryLinked: reuseMap.get(c.id) ?? 0,
      isPublished: c.isPublished,
      storyCategory: c.storyCategory ?? null,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
      updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : String(c.updatedAt),
    }));
  }

  async uploadCollectionCover(
    id: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<{ coverImageUrl: string }> {
    const collection = await this.collectionRepo.findOneBy({ id });
    if (!collection) throw new NotFoundException(`Platform collection ${id} not found`);
    const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const coverImageUrl = await this.storage.upload(buffer, `collection-covers/${id}.${extension}`, contentType);
    collection.coverImageUrl = coverImageUrl;
    await this.collectionRepo.manager.transaction(async manager => {
      await manager.save(PlatformCollectionEntity, collection);
      await manager.update(CollectionEntity, { sourcePlatformCollectionId: id }, { coverImageUrl });
    });
    return { coverImageUrl };
  }

  async updateCollection(
    id: string,
    dto: AdminUpdatePlatformCollectionDto,
  ): Promise<AdminPlatformCollectionListItem> {
    const title = dto.title?.trim();
    if (!title) throw new BadRequestException('title must be a non-empty string');
    if (!['A1', 'A2', 'B1', 'B2', 'C1'].includes(dto.level)) {
      throw new BadRequestException('level must be one of A1, A2, B1, B2, or C1');
    }
    const collection = await this.collectionRepo.findOneBy({ id });
    if (!collection) throw new NotFoundException(`Platform collection ${id} not found`);
    collection.title = title;
    collection.topic = title;
    collection.level = dto.level;
    await this.collectionRepo.save(collection);
    const updated = (await this.listCollections()).find(item => item.id === id);
    if (!updated) throw new NotFoundException(`Platform collection ${id} not found`);
    return updated;
  }

  async setPublished(id: string, isPublished: boolean): Promise<void> {
    const entity = await this.collectionRepo.findOneBy({ id });
    if (!entity) throw new NotFoundException(`Platform collection ${id} not found`);
    if (isPublished) {
      const importRecord = await this.importRepo.findOneBy({ collectionId: id });
      if (importRecord && importRecord.status !== 'ready_to_publish') {
        throw new ConflictException('Collection cannot be published until localization and target audio are ready');
      }
      await this.repairLegacyVocabularyLinks(id);
      const unresolved = await this.wordRepo.countBy({ platformCollectionId: id, lexemeId: IsNull() });
      if (unresolved > 0) {
        throw new ConflictException('Collection cannot be published while vocabulary items are unresolved');
      }
    }
    entity.isPublished = isPublished;
    entity.status = isPublished ? 'published' : 'draft';
    entity.publishedAt = isPublished ? new Date() : null;
    await this.collectionRepo.save(entity);
  }

  private async repairLegacyVocabularyLinks(collectionId: string): Promise<void> {
    const unresolved = await this.wordRepo.findBy({ platformCollectionId: collectionId, lexemeId: IsNull() });
    if (!unresolved.length) return;
    const mappings = await this.dictionaryLexemeRepo.findBy({
      dictionaryWordId: In(unresolved.map(item => item.dictionaryWordId)),
    });
    const lexemeIdByDictionaryId = new Map(mappings.map(mapping => [mapping.dictionaryWordId, mapping.lexemeId]));
    const repaired = unresolved
      .filter(item => lexemeIdByDictionaryId.has(item.dictionaryWordId))
      .map(item => ({ ...item, lexemeId: lexemeIdByDictionaryId.get(item.dictionaryWordId) ?? null }));
    if (repaired.length) await this.wordRepo.save(repaired);
  }

  private validateJsonCollection(dto: AdminImportCollectionJsonDto): void {
    if (!dto.title?.trim()) throw new BadRequestException('title must be a non-empty string');
    if (!['A1', 'A2', 'B1', 'B2', 'C1'].includes(dto.level)) {
      throw new BadRequestException('level must be one of A1, A2, B1, B2, or C1');
    }
    if (!Array.isArray(dto.words) || dto.words.length === 0) {
      throw new BadRequestException('words must be a non-empty JSON array');
    }
    for (let index = 0; index < dto.words.length; index += 1) {
      const word = dto.words[index];
      if (!word || typeof word.back !== 'string' || !word.back.trim()) {
        throw new BadRequestException(`words[${index}].back must be a non-empty string`);
      }
      if (typeof word.front !== 'string' || !word.front.trim()) {
        throw new BadRequestException(`words[${index}].front must be a non-empty string`);
      }
      if (word.article !== null && !['der', 'die', 'das'].includes(word.article)) {
        throw new BadRequestException(`words[${index}].article must be der, die, das, or null`);
      }
      if (word.plural !== undefined && word.plural !== null && typeof word.plural !== 'string') {
        throw new BadRequestException(`words[${index}].plural must be a string or null`);
      }
      if (!word.cefrLevel || !['A1', 'A2', 'B1', 'B2', 'C1'].includes(word.cefrLevel)) {
        throw new BadRequestException(`words[${index}].cefrLevel must be one of A1, A2, B1, B2, or C1`);
      }
      if (!word.wordType || !['noun', 'verb', 'adjective', 'adverb', 'other'].includes(word.wordType)) {
        throw new BadRequestException(`words[${index}].wordType is invalid`);
      }
      if (!Array.isArray(word.examples) || word.examples.length !== 1) {
        throw new BadRequestException(`words[${index}].examples must contain exactly one example`);
      }
      const example = word.examples[0];
      if (typeof example.target !== 'string' || !example.target.trim()
        || typeof example.native !== 'string' || !example.native.trim()) {
        throw new BadRequestException(`words[${index}].examples[0] must contain target and native text`);
      }
      if (word.synonyms !== undefined && !Array.isArray(word.synonyms)) {
        throw new BadRequestException(`words[${index}].synonyms must be an array`);
      }
      const synonyms = word.synonyms ?? [];
      for (let synonymIndex = 0; synonymIndex < synonyms.length; synonymIndex += 1) {
        const synonym = synonyms[synonymIndex];
        if (typeof synonym.word !== 'string' || !synonym.word.trim()
          || typeof synonym.translation !== 'string' || !synonym.translation.trim()) {
          throw new BadRequestException(
            `words[${index}].synonyms[${synonymIndex}] must contain word and translation`,
          );
        }
        if (synonym.article !== null && synonym.article !== undefined
          && !['der', 'die', 'das'].includes(synonym.article)) {
          throw new BadRequestException(
            `words[${index}].synonyms[${synonymIndex}].article must be der, die, das, or null`,
          );
        }
        const hasExample = synonym.example !== undefined || synonym.exampleNative !== undefined;
        if (hasExample && (typeof synonym.example !== 'string' || !synonym.example.trim()
          || typeof synonym.exampleNative !== 'string' || !synonym.exampleNative.trim())) {
          throw new BadRequestException(
            `words[${index}].synonyms[${synonymIndex}] must contain example and exampleNative text`,
          );
        }
      }
    }
  }

  async listCollectionWords(id: string): Promise<AdminPlatformCollectionWordItem[]> {
    const collection = await this.collectionRepo.findOneBy({ id });
    if (!collection) throw new NotFoundException(`Platform collection ${id} not found`);

    const rows: Array<{
      id: string; dictionaryWordId: string; lexemeId: string | null; position: number;
      targetText: string; translation: string | null; localizationStatus: string | null;
    }> = await this.wordRepo.manager.query(
      `SELECT pcw.id,
              pcw."dictionaryWordId",
              pcw."lexemeId",
              pcw.position,
              COALESCE(l."displayText", wd."displayText") AS "targetText",
              COALESCE(ll.translation, wd.translation) AS translation,
              ll.status AS "localizationStatus"
       FROM platform_collection_words pcw
       JOIN word_dictionary wd ON wd.id = pcw."dictionaryWordId"
       LEFT JOIN lexemes l ON l.id = pcw."lexemeId"
       LEFT JOIN LATERAL (
         SELECT localization.translation, localization.status
         FROM lexeme_localizations localization
         WHERE localization."lexemeId" = pcw."lexemeId"
           AND localization.language = $2
           AND localization."isActive" = true
         ORDER BY localization."contentVersion" DESC
         LIMIT 1
       ) ll ON true
       WHERE pcw."platformCollectionId" = $1
       ORDER BY pcw.position ASC, pcw."createdAt" ASC`,
      [id, collection.sourceLanguage],
    );

    return rows.map(row => ({
      id: row.id,
      dictionaryWordId: row.dictionaryWordId,
      lexemeId: row.lexemeId,
      position: row.position,
      targetText: row.targetText,
      translation: row.translation ?? '',
      localizationReady: row.lexemeId !== null && row.localizationStatus === 'ready',
    }));
  }

  async removeCollectionWord(collectionId: string, itemId: string): Promise<void> {
    const collection = await this.collectionRepo.findOneBy({ id: collectionId });
    if (!collection) throw new NotFoundException(`Platform collection ${collectionId} not found`);
    if (collection.isPublished) throw new ConflictException('Unpublish the collection before editing its vocabulary');

    const item = await this.wordRepo.findOneBy({ id: itemId, platformCollectionId: collectionId });
    if (!item) throw new NotFoundException(`Collection word ${itemId} not found`);
    await this.wordRepo.manager.transaction(async manager => {
      await manager.delete(PlatformCollectionWordEntity, { id: itemId, platformCollectionId: collectionId });
      const remaining = await manager.find(PlatformCollectionWordEntity, {
        where: { platformCollectionId: collectionId }, order: { position: 'ASC', createdAt: 'ASC' },
      });
      await Promise.all(remaining.map((word, position) => manager.update(PlatformCollectionWordEntity, word.id, { position })));
      await manager.update(PlatformCollectionEntity, collectionId, { wordCount: remaining.length, status: 'draft' });
    });
  }

  async reorderCollectionWords(collectionId: string, itemIds: string[]): Promise<void> {
    const collection = await this.collectionRepo.findOneBy({ id: collectionId });
    if (!collection) throw new NotFoundException(`Platform collection ${collectionId} not found`);
    if (collection.isPublished) throw new ConflictException('Unpublish the collection before editing its vocabulary');
    if (!Array.isArray(itemIds) || itemIds.some(itemId => typeof itemId !== 'string' || !itemId)) {
      throw new ConflictException('Word order must be an array of item IDs');
    }
    if (new Set(itemIds).size !== itemIds.length) throw new ConflictException('Word order contains duplicate item IDs');

    const existing = await this.wordRepo.findBy({ platformCollectionId: collectionId });
    const expected = new Set(existing.map(item => item.id));
    if (itemIds.length !== existing.length || itemIds.some(itemId => !expected.has(itemId))) {
      throw new ConflictException('Word order must contain every collection item exactly once');
    }
    await this.wordRepo.manager.transaction(async manager => {
      await Promise.all(itemIds.map((itemId, position) => manager.update(PlatformCollectionWordEntity, itemId, { position })));
    });
  }

  async setStoryCategory(id: string, storyCategory: string | null): Promise<void> {
    const entity = await this.collectionRepo.findOneBy({ id });
    if (!entity) throw new NotFoundException(`Platform collection ${id} not found`);
    entity.storyCategory = storyCategory;
    await this.collectionRepo.save(entity);
  }

  async listStories(): Promise<AdminPlatformStoryListItem[]> {
    const stories = await this.storyRepo.find({ order: { publishedAt: 'DESC' } });
    return stories.map(s => ({
      id: s.id,
      title: s.title,
      titleTranslation: s.titleTranslation,
      level: s.level,
      category: s.category,
      wordCount: s.wordCount,
      isPublished: s.isPublished,
      platformCollectionId: s.platformCollectionId,
      publishedAt: s.publishedAt instanceof Date ? s.publishedAt.toISOString() : String(s.publishedAt),
    }));
  }

  async deleteCollection(id: string): Promise<void> {
    const entity = await this.collectionRepo.findOneBy({ id });
    if (!entity) throw new NotFoundException(`Platform collection ${id} not found`);
    if (entity.isPublished || entity.status === 'published') {
      throw new ConflictException('Unpublish the collection before deleting it');
    }
    const references: Array<{ count: number }> = await this.collectionRepo.manager.query(
      `SELECT COUNT(*)::int AS count FROM collections WHERE "sourcePlatformCollectionId" = $1`,
      [id],
    );
    if (Number(references[0]?.count ?? 0) > 0) {
      throw new ConflictException('This collection has been adopted by learners and cannot be deleted; keep it unpublished instead');
    }
    // Remove member word links, then detach any stories paired to this collection.
    await this.collectionRepo.manager.transaction(async manager => {
      await manager.delete(PlatformCollectionWordEntity, { platformCollectionId: id });
      await manager.update(PlatformStoryEntity, { platformCollectionId: id }, { platformCollectionId: null });
      await manager.delete(PlatformCollectionEntity, { id });
    });
  }

  async deleteStory(id: string): Promise<void> {
    const entity = await this.storyRepo.findOneBy({ id });
    if (!entity) throw new NotFoundException(`Platform story ${id} not found`);
    // Remove per-user progress rows referencing this story before deleting it.
    await this.storyProgressRepo.delete({ storyId: id });
    await this.storyRepo.delete({ id });
  }

  async setPublishedStory(id: string, isPublished: boolean): Promise<void> {
    const entity = await this.storyRepo.findOneBy({ id });
    if (!entity) throw new NotFoundException(`Platform story ${id} not found`);
    entity.isPublished = isPublished;
    await this.storyRepo.save(entity);
  }
}
