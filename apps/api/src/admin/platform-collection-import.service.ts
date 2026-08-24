import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import type {
  AdminPlatformCollectionImportPreview,
  AdminPlatformCollectionImportResult,
  AdminPlatformCollectionImportStatus,
} from '@lingua-card/shared/domain';
import { WordDictionaryService } from '../word-dictionary/word-dictionary.service';
import { WordAudioService } from '../word-audio/word-audio.service';
import { canonicalizeLanguageCode } from '../vocabulary/domain/language-code';
import { LexemeIdentityService } from '../vocabulary/domain/lexeme-identity.service';
import { SpeechIdentityService } from '../vocabulary/domain/speech-identity.service';
import { LexemeEntity } from '../vocabulary/entities/lexeme.entity';
import { LegacyVocabularyProjectionService } from '../vocabulary/services/legacy-vocabulary-projection.service';
import type { LexemeIdentity } from '../vocabulary/models/vocabulary.types';
import type { AiConfig } from '../config/ai.config';
import type { PlatformCollectionImportPayloadDto } from './dto/platform-collection-import.dto';
import { PlatformCollectionImportEntity } from './platform-collection-import.entity';
import { PlatformCollectionImportRepository } from './platform-collection-import.repository';

interface ResolvedImportItem {
  dictionaryWordId: string;
  lexemeId: string;
  position: number;
}

const STALE_IMPORT_MS = 10 * 60 * 1000;

@Injectable()
export class PlatformCollectionImportService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlatformCollectionImportService.name);
  private readonly speechVoiceKey: string;

  constructor(
    private readonly dictionary: WordDictionaryService,
    private readonly wordAudio: WordAudioService,
    private readonly lexemeIdentity: LexemeIdentityService,
    private readonly speechIdentity: SpeechIdentityService,
    private readonly vocabularyProjection: LegacyVocabularyProjectionService,
    private readonly repository: PlatformCollectionImportRepository,
    config: ConfigService,
  ) {
    this.speechVoiceKey = config.get<AiConfig>('ai')?.googleCloudTtsVoice
      || 'de-DE-Chirp3-HD-Charon';
  }

  async onApplicationBootstrap(): Promise<void> {
    const interrupted = await this.repository.findImportsInProgress();
    for (const record of interrupted) {
      if (!record.payload) continue;
      const delay = Math.max(0, record.updatedAt.getTime() + STALE_IMPORT_MS - Date.now());
      setTimeout(() => {
        void this.importDraft(record.fingerprint, record.payload!).catch(error => {
          this.logger.error(`Unable to resume platform collection import ${record.id}`, error instanceof Error ? error.stack : undefined);
        });
      }, delay);
    }
  }

  async validate(payload: PlatformCollectionImportPayloadDto): Promise<AdminPlatformCollectionImportPreview> {
    const sourceLanguage = canonicalizeLanguageCode(payload.collection.sourceLanguage);
    const targetLanguage = canonicalizeLanguageCode(payload.collection.targetLanguage);
    if (sourceLanguage === targetLanguage) {
      throw new BadRequestException('Source and target languages must be different');
    }
    await this.assertSupportedPair(sourceLanguage, targetLanguage);

    const identities = payload.items.map(item => this.lexemeIdentity.createIdentity({
      language: targetLanguage,
      text: item.lexeme.text,
      partOfSpeech: item.lexeme.partOfSpeech,
      grammar: {
        article: item.lexeme.grammar.article,
        gender: item.lexeme.grammar.gender,
        plurals: item.lexeme.grammar.plurals,
      },
    }));
    const conflicts = this.documentConflicts(payload, identities, sourceLanguage, targetLanguage);
    const collectionWithExternalId = await this.repository.findCollectionByExternalId(payload.collection.externalId);
    if (collectionWithExternalId) {
      conflicts.push({
        code: 'external-id-conflict', itemIndex: 0, pointer: '/collection/externalId', severity: 'error',
        message: 'A platform collection already uses this external ID.',
        remediation: 'Choose a stable external ID that is unique to this collection.',
      });
    }
    const existingLexemes = await this.findExistingLexemes(targetLanguage, identities);
    const existingByIdentity = new Map(existingLexemes.map(lexeme => [this.identityKey(lexeme), lexeme]));
    const existingLocalizations = existingLexemes.length
      ? await this.repository.findActiveLocalizations(existingLexemes.map(lexeme => lexeme.id), sourceLanguage)
      : [];
    const localizationByLexeme = new Map(existingLocalizations.map(item => [item.lexemeId, item]));

    let reused = 0;
    let localizationsReady = 0;
    for (let index = 0; index < payload.items.length; index += 1) {
      const existingLexeme = existingByIdentity.get(this.identityKey(identities[index]));
      if (!existingLexeme) {
        localizationsReady += 1;
        continue;
      }
      reused += 1;
      if (!this.lexemeContentMatches(existingLexeme, payload.items[index], targetLanguage)) {
        conflicts.push({
          code: 'existing-content-conflict', itemIndex: index, pointer: `/items/${index}/lexeme`, severity: 'error',
          message: 'The supplied lexical facts differ from the shared lexeme.',
          remediation: 'Use the existing reviewed lexical facts or resolve the difference before importing.',
        });
      }
      const existingLocalization = localizationByLexeme.get(existingLexeme.id);
      if (!existingLocalization) {
        localizationsReady += 1;
        continue;
      }
      const suppliedLocalization = payload.items[index].localization;
      if (this.normalizeText(existingLocalization.translation, sourceLanguage)
          === this.normalizeText(suppliedLocalization.translation, sourceLanguage)
          && this.normalizeNullableText(existingLocalization.definition, sourceLanguage)
            === this.normalizeNullableText(suppliedLocalization.definition, sourceLanguage)) {
        localizationsReady += 1;
      } else {
        conflicts.push({
          code: 'existing-content-conflict',
          itemIndex: index,
          pointer: `/items/${index}/localization/translation`,
          severity: 'error',
          message: `The shared ${sourceLanguage} localization differs from this file.`,
          remediation: 'Use the existing reviewed translation or create a reviewed content version.',
        });
      }
    }

    const requiredSpeechTexts = payload.items.flatMap(item => [
      this.spokenHeadword(item.lexeme.text, item.lexeme.grammar.article),
      ...item.examples.map(example => example.targetText),
    ]);
    const speechIdentities = this.uniqueSpeechIdentities(requiredSpeechTexts, targetLanguage);
    const readySpeechIdentities = await this.repository.findReadySpeechIdentityKeys(
      speechIdentities.map(identity => identity.identityKey),
    );
    const readySpeech = speechIdentities.filter(identity => readySpeechIdentities.has(identity.identityKey)).length;

    return {
      fingerprint: this.fingerprint(payload),
      status: conflicts.length ? 'conflicts' : 'valid',
      fileName: payload.fileName?.trim() || `${this.slug(payload.collection.title)}-v2.json`,
      schemaVersion: 2,
      sourceLanguage,
      targetLanguage,
      counts: { items: payload.items.length, reused, new: payload.items.length - reused, conflicts: conflicts.length },
      readiness: {
        metadataReady: true,
        lexemesResolved: payload.items.length,
        localizationsReady,
        targetAudioReady: Math.min(readySpeech, requiredSpeechTexts.length),
        targetAudioRequired: speechIdentities.length,
      },
      conflicts,
      collection: {
        title: payload.collection.title,
        level: payload.collection.level,
        topic: payload.collection.topic,
        coverSeed: this.coverSeed(payload.collection.title),
        status: 'draft',
      },
    };
  }

  async importDraft(
    fingerprint: string,
    payload: PlatformCollectionImportPayloadDto,
  ): Promise<AdminPlatformCollectionImportResult> {
    const previousImport = await this.repository.findImportByFingerprint(fingerprint);
    if ((previousImport?.status === 'ready_to_publish' || previousImport?.status === 'needs_attention')
        && previousImport.collectionId) {
      return this.toCompletedResult(previousImport);
    }
    const staleBefore = new Date(Date.now() - STALE_IMPORT_MS);
    if (previousImport?.status === 'importing' && previousImport.updatedAt >= staleBefore) {
      throw new ConflictException('This collection import is already processing');
    }
    const preview = await this.validate(payload);
    if (preview.fingerprint !== fingerprint) throw new ConflictException('The import payload changed after validation');
    if (preview.conflicts.length) throw new ConflictException('Resolve content conflicts before importing');

    const importRecord = await this.claimImport(fingerprint, payload.collection.title, payload);
    const claimed = await this.repository.tryStartImport(importRecord, payload.items.length, staleBefore);
    if (!claimed) throw new ConflictException('This collection import is already processing');
    importRecord.status = 'importing';

    queueMicrotask(() => {
      void this.processClaimedImport(payload, preview, importRecord);
    });
    return {
      importId: importRecord.id,
      collectionId: null,
      title: importRecord.title,
      status: 'processing',
      inserted: 0,
      reused: 0,
      audioLinked: 0,
    };
  }

  private async processClaimedImport(
    payload: PlatformCollectionImportPayloadDto,
    preview: AdminPlatformCollectionImportPreview,
    importRecord: PlatformCollectionImportEntity,
  ): Promise<void> {
    try {
      const targetLanguageConfig = await this.repository.findLanguage(preview.targetLanguage);
      importRecord.stage = 'resolve_vocabulary';
      importRecord.totalItems = payload.items.length;
      importRecord.processedItems = 0;
      importRecord.rowErrors = [];
      const resolvedItems = await this.resolveItems(payload, targetLanguageConfig.defaultLocale, importRecord);
      importRecord.stage = 'prepare_audio';
      await this.repository.saveImport(importRecord);
      await this.wordAudio.batchResolve(payload.items.flatMap(item => [
        {
          text: this.spokenHeadword(item.lexeme.text, item.lexeme.grammar.article),
          language: targetLanguageConfig.defaultLocale,
        },
        ...item.examples.map(example => ({ text: example.targetText, language: targetLanguageConfig.defaultLocale })),
      ]));
      const readinessAfterGeneration = await this.audioReadiness(payload, preview.targetLanguage);
      const collectionId = randomUUID();
      importRecord.stage = 'commit_collection';
      await this.repository.saveImport(importRecord);
      importRecord.status = readinessAfterGeneration.ready === readinessAfterGeneration.required
        ? 'ready_to_publish'
        : 'needs_attention';
      importRecord.collectionId = collectionId;
      importRecord.inserted = preview.counts.new;
      importRecord.reused = preview.counts.reused;
      importRecord.audioLinked = readinessAfterGeneration.ready;
      importRecord.stage = 'complete';
      await this.repository.commitCollection({
        collection: {
          id: collectionId,
          externalId: payload.collection.externalId,
          title: payload.collection.title,
          description: payload.collection.description,
          sourceLanguage: preview.sourceLanguage,
          targetLanguage: preview.targetLanguage,
          coverSeed: preview.collection.coverSeed,
          coverImageUrl: null,
          emoji: null,
          level: payload.collection.level,
          topic: payload.collection.topic,
          isPublished: false,
          status: 'draft',
          wordCount: resolvedItems.length,
          storyCategory: null,
        },
        items: resolvedItems.map(item => ({
          id: randomUUID(),
          platformCollectionId: collectionId,
          dictionaryWordId: item.dictionaryWordId,
          lexemeId: item.lexemeId,
          position: item.position,
        })),
        importRecord,
      });
    } catch (error) {
      this.logger.error(`Platform collection import ${importRecord.id} failed`, error instanceof Error ? error.stack : undefined);
      importRecord.status = 'failed';
      importRecord.error = 'The import could not be completed';
      importRecord.stage = 'failed';
      if (!importRecord.rowErrors.length) {
        importRecord.rowErrors = [{ itemIndex: null, message: importRecord.error }];
      }
      await this.repository.saveImport(importRecord);
    }
  }

  async findImport(id: string): Promise<AdminPlatformCollectionImportStatus> {
    const record = await this.repository.findImportById(id);
    if (!record) throw new NotFoundException(`Platform collection import ${id} not found`);
    return this.toStatus(record);
  }

  async retryImport(id: string): Promise<AdminPlatformCollectionImportResult> {
    const record = await this.repository.findImportPayload(id);
    if (!record?.payload) throw new NotFoundException(`Recoverable platform collection import ${id} not found`);
    if (record.status === 'needs_attention' && record.collectionId) {
      const targetLanguage = canonicalizeLanguageCode(record.payload.collection.targetLanguage);
      const language = await this.repository.findLanguage(targetLanguage);
      await this.wordAudio.batchResolve(record.payload.items.flatMap(item => [
        { text: this.spokenHeadword(item.lexeme.text, item.lexeme.grammar.article), language: language.defaultLocale },
        ...item.examples.map(example => ({ text: example.targetText, language: language.defaultLocale })),
      ]));
      const readiness = await this.audioReadiness(record.payload, targetLanguage);
      record.audioLinked = readiness.ready;
      record.status = readiness.ready === readiness.required ? 'ready_to_publish' : 'needs_attention';
      await this.repository.saveImport(record);
      return this.toCompletedResult(record);
    }
    return this.importDraft(record.fingerprint, record.payload);
  }

  private async assertSupportedPair(sourceLanguage: string, targetLanguage: string): Promise<void> {
    const configured = await this.repository.findLanguages([sourceLanguage, targetLanguage]);
    const source = configured.find(language => language.code === sourceLanguage);
    const target = configured.find(language => language.code === targetLanguage);
    if (!source?.isSourceEnabled || !target?.isTargetEnabled) {
      throw new BadRequestException(`Unsupported language pair: ${sourceLanguage} → ${targetLanguage}`);
    }
  }

  private documentConflicts(
    payload: PlatformCollectionImportPayloadDto,
    identities: readonly LexemeIdentity[],
    sourceLanguage: string,
    targetLanguage: string,
  ): AdminPlatformCollectionImportPreview['conflicts'] {
    const conflicts: AdminPlatformCollectionImportPreview['conflicts'] = [];
    const positions = new Set<number>();
    const identityIndexes = new Map<string, number>();
    for (let index = 0; index < payload.items.length; index += 1) {
      const item = payload.items[index];
      if (positions.has(item.position)) {
        conflicts.push({
          code: 'duplicate-position', itemIndex: index, pointer: `/items/${index}/position`, severity: 'error',
          message: `Position ${item.position} is used more than once.`, remediation: 'Assign every item a unique position.',
        });
      }
      positions.add(item.position);
      const key = this.identityKey(identities[index]);
      const firstIndex = identityIndexes.get(key);
      if (firstIndex !== undefined) {
        conflicts.push({
          code: 'duplicate-lexeme', itemIndex: index, pointer: `/items/${index}/lexeme`, severity: 'error',
          message: `This lexeme duplicates item ${firstIndex + 1}.`, remediation: 'Keep one item for each lexical identity.',
        });
      } else {
        identityIndexes.set(key, index);
      }
      if (canonicalizeLanguageCode(item.localization.language) !== sourceLanguage) {
        conflicts.push({
          code: 'translation-mismatch', itemIndex: index, pointer: `/items/${index}/localization/language`, severity: 'error',
          message: 'Localization language does not match the collection source language.',
          remediation: `Set localization.language to “${sourceLanguage}”.`,
        });
      }
      if (targetLanguage === 'de') {
        const article = item.lexeme.grammar.article;
        const hasInvalidArticle = article !== null && article !== 'der' && article !== 'die' && article !== 'das';
        const hasArticleOnNonNoun = item.lexeme.partOfSpeech !== 'noun' && article !== null;
        if (hasInvalidArticle || hasArticleOnNonNoun) {
          conflicts.push({
            code: 'invalid-grammar', itemIndex: index, pointer: `/items/${index}/lexeme/grammar/article`, severity: 'error',
            message: 'German articles must be der, die, or das and may only be attached to nouns.',
            remediation: 'Correct the article or set it to null.',
          });
        }
      }
    }
    return conflicts;
  }

  private async findExistingLexemes(language: string, identities: readonly LexemeIdentity[]): Promise<LexemeEntity[]> {
    const lemmas = [...new Set(identities.map(identity => identity.normalizedLemma))];
    if (!lemmas.length) return [];
    return this.repository.findLexemes(language, lemmas);
  }

  private async claimImport(
    fingerprint: string,
    title: string,
    payload: PlatformCollectionImportPayloadDto,
  ): Promise<PlatformCollectionImportEntity> {
    return this.repository.claimImport(fingerprint, title, payload);
  }

  private async audioReadiness(
    payload: PlatformCollectionImportPayloadDto,
    targetLanguage: string,
  ): Promise<{ ready: number; required: number }> {
    const texts = payload.items.flatMap(item => [
      this.spokenHeadword(item.lexeme.text, item.lexeme.grammar.article),
      ...item.examples.map(example => example.targetText),
    ]);
    const identities = this.uniqueSpeechIdentities(texts, targetLanguage);
    if (!identities.length) return { ready: 0, required: 0 };
    const ready = await this.repository.findReadySpeechIdentityKeys(identities.map(identity => identity.identityKey));
    return { ready: identities.filter(identity => ready.has(identity.identityKey)).length, required: identities.length };
  }

  private uniqueSpeechIdentities(texts: readonly string[], language: string) {
    const identities = texts.map(text => this.speechIdentity.createIdentity({
      language,
      text,
      voiceKey: this.speechVoiceKey,
      profileVersion: 1,
      contentKind: 'word',
    }));
    return [...new Map(identities.map(identity => [identity.identityKey, identity])).values()];
  }

  private async resolveItems(
    payload: PlatformCollectionImportPayloadDto,
    targetSpeechLocale: string,
    importRecord: PlatformCollectionImportEntity,
  ): Promise<ResolvedImportItem[]> {
    const sourceLanguage = canonicalizeLanguageCode(payload.collection.sourceLanguage);
    const targetLanguage = canonicalizeLanguageCode(payload.collection.targetLanguage);
    const resolved: ResolvedImportItem[] = [];
    const orderedItems = payload.items
      .map((item, itemIndex) => ({ item, itemIndex }))
      .sort((left, right) => left.item.position - right.item.position);
    for (let index = 0; index < orderedItems.length; index += 1) {
      const { item, itemIndex } = orderedItems[index];
      try {
        const article = this.germanArticle(item.lexeme.grammar.article);
        const dictionaryWord = await this.dictionary.persistEnriched({
        back: item.lexeme.text,
        front: item.localization.translation,
        article,
        plural: item.lexeme.grammar.plurals[0] ?? null,
        phonetic: item.lexeme.phonetic,
        cefrLevel: item.lexeme.cefrLevel,
        categoryName: payload.collection.topic,
        wordType: item.lexeme.partOfSpeech,
        examples: item.examples.map(example => ({ target: example.targetText, native: example.sourceText })),
        }, targetSpeechLocale, sourceLanguage);
        const projection = await this.vocabularyProjection.project({
        targetLanguage,
        sourceLanguage,
        displayText: item.lexeme.text,
        article: item.lexeme.grammar.article,
        gender: item.lexeme.grammar.gender,
        translation: item.localization.translation,
        definition: item.localization.definition,
        partOfSpeech: item.lexeme.partOfSpeech,
        phonetic: item.lexeme.phonetic,
        cefrLevel: item.lexeme.cefrLevel,
        plurals: item.lexeme.grammar.plurals,
        examples: item.examples.map(example => ({ target: example.targetText, source: example.sourceText })),
        synonyms: [],
        source: 'admin',
        model: null,
        }, dictionaryWord.id);
        resolved.push({ dictionaryWordId: dictionaryWord.id, lexemeId: projection.lexemeId, position: item.position - 1 });
        importRecord.processedItems = index + 1;
        await this.repository.saveImport(importRecord);
      } catch (error) {
        const message = 'Vocabulary resolution failed';
        importRecord.rowErrors = [...importRecord.rowErrors, { itemIndex, message }];
        await this.repository.saveImport(importRecord);
        throw error;
      }
    }
    return resolved;
  }

  private germanArticle(value: string | null): 'der' | 'die' | 'das' | null {
    return value === 'der' || value === 'die' || value === 'das' ? value : null;
  }

  private spokenHeadword(text: string, article: string | null): string {
    return article ? `${article} ${text}` : text;
  }

  private identityKey(identity: Pick<LexemeIdentity, 'language' | 'normalizedLemma' | 'partOfSpeech' | 'grammarDiscriminator'>): string {
    return `${identity.language}\u0000${identity.normalizedLemma}\u0000${identity.partOfSpeech}\u0000${identity.grammarDiscriminator}`;
  }

  private normalizeText(value: string, language: string): string {
    return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase(language);
  }

  private normalizeNullableText(value: string | null, language: string): string {
    return value ? this.normalizeText(value, language) : '';
  }

  private lexemeContentMatches(
    existing: LexemeEntity,
    item: PlatformCollectionImportPayloadDto['items'][number],
    language: string,
  ): boolean {
    const existingPlurals = existing.grammar.plurals.map(value => this.normalizeText(value, language)).sort();
    const suppliedPlurals = item.lexeme.grammar.plurals.map(value => this.normalizeText(value, language)).sort();
    return this.normalizeText(existing.displayText, language) === this.normalizeText(item.lexeme.text, language)
      && this.normalizeNullableText(existing.phonetic, language)
        === this.normalizeNullableText(item.lexeme.phonetic, language)
      && (existing.cefrLevel ?? '') === (item.lexeme.cefrLevel ?? '')
      && JSON.stringify(existingPlurals) === JSON.stringify(suppliedPlurals);
  }

  private coverSeed(title: string): string {
    return title.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
  }

  private fingerprint(payload: PlatformCollectionImportPayloadDto): string {
    const canonical = {
      schemaVersion: 2,
      collection: {
        ...payload.collection,
        sourceLanguage: canonicalizeLanguageCode(payload.collection.sourceLanguage),
        targetLanguage: canonicalizeLanguageCode(payload.collection.targetLanguage),
      },
      items: [...payload.items].sort((left, right) => left.position - right.position),
    };
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  private toCompletedResult(record: PlatformCollectionImportEntity): AdminPlatformCollectionImportResult {
    if (!record.collectionId) throw new ConflictException('Completed import has no collection');
    return {
      importId: record.id, collectionId: record.collectionId, title: record.title,
      status: record.status === 'needs_attention' ? 'needs_attention' : 'completed',
      inserted: record.inserted, reused: record.reused, audioLinked: record.audioLinked,
    };
  }

  private toStatus(record: PlatformCollectionImportEntity): AdminPlatformCollectionImportStatus {
    return {
      importId: record.id, fingerprint: record.fingerprint,
      status: record.status === 'ready_to_publish'
        ? 'completed'
        : record.status === 'needs_attention'
          ? 'needs_attention'
          : record.status === 'importing' || record.status === 'ready_to_import'
            ? 'processing'
            : 'failed',
      collectionId: record.collectionId, title: record.title, inserted: record.inserted,
      reused: record.reused, audioLinked: record.audioLinked, error: record.error,
      stage: record.stage, processedItems: record.processedItems, totalItems: record.totalItems,
      rowErrors: record.rowErrors,
    };
  }

  private slug(value: string): string {
    return this.coverSeed(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
}
