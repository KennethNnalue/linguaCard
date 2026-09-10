import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { LexemeIdentityService } from '../domain/lexeme-identity.service';
import { stableResourceId } from '../domain/stable-resource-id';
import { canonicalizeLanguageCode } from '../domain/language-code';
import { ExampleLocalizationEntity } from '../entities/example-localization.entity';
import { ExampleSentenceEntity } from '../entities/example-sentence.entity';
import { LexemeLocalizationEntity } from '../entities/lexeme-localization.entity';
import { LexemeEntity } from '../entities/lexeme.entity';
import { LegacyDictionaryLexemeEntity } from '../entities/legacy-dictionary-lexeme.entity';
import type {
  LexemeIdentity,
  LegacyVocabularyProjectionInput,
  VocabularyProjectionResult,
} from '../models/vocabulary.types';

interface PendingProjection {
  input: LegacyVocabularyProjectionInput;
  legacyDictionaryWordId: string;
  identity: LexemeIdentity;
  proposedLexemeId: string;
}

interface ResolvedProjection extends PendingProjection {
  lexemeId: string;
}

@Injectable()
export class LegacyVocabularyProjectionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly lexemeIdentity: LexemeIdentityService,
  ) {}

  project(
    input: LegacyVocabularyProjectionInput,
    legacyDictionaryWordId?: string,
  ): Promise<VocabularyProjectionResult> {
    return this.dataSource.transaction(manager =>
      this.projectInTransaction(manager, input, legacyDictionaryWordId));
  }

  async projectMany(
    inputs: ReadonlyArray<{
      input: LegacyVocabularyProjectionInput;
      legacyDictionaryWordId?: string;
    }>,
  ): Promise<void> {
    await this.dataSource.transaction(async manager => {
      for (const item of inputs) {
        await this.projectInTransaction(manager, item.input, item.legacyDictionaryWordId);
      }
    });
  }

  async projectMissing(
    inputs: ReadonlyArray<{
      input: LegacyVocabularyProjectionInput;
      legacyDictionaryWordId: string;
    }>,
  ): Promise<void> {
    if (!inputs.length) return;
    await this.dataSource.transaction(async manager => {
      const mappingRepo = manager.getRepository(LegacyDictionaryLexemeEntity);
      const existing = await mappingRepo.findBy({
        dictionaryWordId: In(inputs.map(item => item.legacyDictionaryWordId)),
      });
      const projectedDictionaryIds = new Set(existing.map(mapping => mapping.dictionaryWordId));
      const pending = inputs
        .filter(item => !projectedDictionaryIds.has(item.legacyDictionaryWordId))
        .map(item => this.pendingProjection(item.input, item.legacyDictionaryWordId));
      if (!pending.length) return;

      const uniqueLexemes = new Map<string, PendingProjection>();
      for (const item of pending) {
        const key = this.identityKey(item.identity);
        if (!uniqueLexemes.has(key)) uniqueLexemes.set(key, item);
      }
      const lexemeRepo = manager.getRepository(LexemeEntity);
      await lexemeRepo.createQueryBuilder()
        .insert()
        .values([...uniqueLexemes.values()].map(item => ({
          id: item.proposedLexemeId,
          language: item.identity.language,
          normalizedLemma: item.identity.normalizedLemma,
          displayText: item.identity.displayText,
          partOfSpeech: item.identity.partOfSpeech,
          grammarDiscriminator: item.identity.grammarDiscriminator,
          grammar: {
            article: item.input.article,
            gender: item.input.gender,
            plurals: [...item.input.plurals],
          },
          phonetic: item.input.phonetic,
          cefrLevel: item.input.cefrLevel,
          source: item.input.source,
          model: item.input.model,
        })))
        .orUpdate(
          ['displayText', 'grammar', 'phonetic', 'cefrLevel', 'source', 'model'],
          ['language', 'normalizedLemma', 'partOfSpeech', 'grammarDiscriminator'],
          { skipUpdateIfNoValuesChanged: true },
        )
        .execute();
      const lexemes = await lexemeRepo.find({
        where: {
          language: In([...new Set(pending.map(item => item.identity.language))]),
          normalizedLemma: In([...new Set(pending.map(item => item.identity.normalizedLemma))]),
        },
      });
      const lexemeByIdentity = new Map(lexemes.map(lexeme => [this.identityKey(lexeme), lexeme]));
      const resolved: ResolvedProjection[] = pending.map(item => {
        const lexeme = lexemeByIdentity.get(this.identityKey(item.identity));
        if (!lexeme) throw new Error(`Unable to resolve projected lexeme for ${item.input.displayText}`);
        return { ...item, lexemeId: lexeme.id };
      });

      await mappingRepo.upsert(resolved.map(item => ({
        dictionaryWordId: item.legacyDictionaryWordId,
        lexemeId: item.lexemeId,
      })), {
        conflictPaths: ['dictionaryWordId'],
        skipUpdateIfNoValuesChanged: true,
      });
      const localizations = new Map<string, {
        id: string;
        lexemeId: string;
        language: string;
        translation: string;
        definition: string | null;
        synonyms: Array<LegacyVocabularyProjectionInput['synonyms'][number]>;
        status: 'ready';
        contentVersion: number;
        isActive: boolean;
        source: LegacyVocabularyProjectionInput['source'];
        model: string | null;
      }>();
      for (const item of resolved) {
        const sourceLanguage = canonicalizeLanguageCode(item.input.sourceLanguage);
        const key = [item.lexemeId, sourceLanguage, '1'].join('\u0000');
        if (localizations.has(key)) continue;
        localizations.set(key, {
          id: stableResourceId('lexeme-localization', item.lexemeId, sourceLanguage, '1'),
          lexemeId: item.lexemeId,
          language: sourceLanguage,
          translation: item.input.translation,
          definition: item.input.definition ?? null,
          synonyms: item.input.synonyms.map(synonym => ({ ...synonym })),
          status: 'ready',
          contentVersion: 1,
          isActive: true,
          source: item.input.source,
          model: item.input.model,
        });
      }
      await manager.getRepository(LexemeLocalizationEntity).upsert(
        [...localizations.values()],
        { conflictPaths: ['lexemeId', 'language', 'contentVersion'], skipUpdateIfNoValuesChanged: true },
      );

      await this.projectExamplesBatch(manager, resolved);
    });
  }

  private async projectExamplesBatch(
    manager: EntityManager,
    projections: readonly ResolvedProjection[],
  ): Promise<void> {
    const examples = new Map<string, {
      id: string;
      lexemeId: string;
      language: string;
      normalizedText: string;
      displayText: string;
      position: number;
      source: LegacyVocabularyProjectionInput['source'];
      model: string | null;
      sourceLanguage: string;
      sourceText: string;
    }>();
    for (const projection of projections) {
      for (let position = 0; position < projection.input.examples.length; position += 1) {
        const example = projection.input.examples[position];
        const targetText = example.target.normalize('NFC').trim().replace(/\s+/gu, ' ');
        if (!targetText) continue;
        const normalizedText = targetText.toLocaleLowerCase(projection.identity.language);
        const key = this.exampleKey(projection.lexemeId, projection.identity.language, normalizedText);
        if (examples.has(key)) continue;
        examples.set(key, {
          id: stableResourceId('example-sentence', projection.lexemeId, projection.identity.language, normalizedText),
          lexemeId: projection.lexemeId,
          language: projection.identity.language,
          normalizedText,
          displayText: targetText,
          position,
          source: projection.input.source,
          model: projection.input.model,
          sourceLanguage: canonicalizeLanguageCode(projection.input.sourceLanguage),
          sourceText: example.source.normalize('NFC').trim().replace(/\s+/gu, ' '),
        });
      }
    }
    if (!examples.size) return;
    const exampleRepo = manager.getRepository(ExampleSentenceEntity);
    await exampleRepo.createQueryBuilder()
      .insert()
      .values([...examples.values()].map(example => ({
        id: example.id,
        lexemeId: example.lexemeId,
        language: example.language,
        normalizedText: example.normalizedText,
        displayText: example.displayText,
        position: example.position,
        source: example.source,
        model: example.model,
      })))
      .orUpdate(
        ['displayText', 'position', 'source', 'model'],
        ['lexemeId', 'language', 'normalizedText'],
        { skipUpdateIfNoValuesChanged: true },
      )
      .execute();
    const savedExamples = await exampleRepo.find({
      where: { lexemeId: In([...new Set(projections.map(item => item.lexemeId))]) },
    });
    const savedByIdentity = new Map(savedExamples.map(example => [
      this.exampleKey(example.lexemeId, example.language, example.normalizedText),
      example,
    ]));
    const localizations = [...examples.entries()]
      .filter(([, example]) => example.sourceText.length > 0)
      .map(([key, example]) => {
        const saved = savedByIdentity.get(key);
        if (!saved) throw new Error(`Unable to resolve projected example for ${example.displayText}`);
        return {
          id: stableResourceId('example-localization', saved.id, example.sourceLanguage, '1'),
          exampleSentenceId: saved.id,
          language: example.sourceLanguage,
          text: example.sourceText,
          status: 'ready' as const,
          contentVersion: 1,
          isActive: true,
          source: example.source,
          model: example.model,
        };
      });
    if (localizations.length) {
      await manager.getRepository(ExampleLocalizationEntity).upsert(localizations, {
        conflictPaths: ['exampleSentenceId', 'language', 'contentVersion'],
        skipUpdateIfNoValuesChanged: true,
      });
    }
  }

  private pendingProjection(
    input: LegacyVocabularyProjectionInput,
    legacyDictionaryWordId: string,
  ): PendingProjection {
    const identity = this.lexemeIdentity.createIdentity({
      language: input.targetLanguage,
      text: input.displayText,
      partOfSpeech: input.partOfSpeech,
      grammar: { article: input.article, gender: input.gender, plurals: [...input.plurals] },
    });
    return {
      input,
      legacyDictionaryWordId,
      identity,
      proposedLexemeId: stableResourceId(
        'lexeme', identity.language, identity.normalizedLemma,
        identity.partOfSpeech, identity.grammarDiscriminator,
      ),
    };
  }

  private identityKey(identity: Pick<LexemeIdentity, 'language' | 'normalizedLemma' | 'partOfSpeech' | 'grammarDiscriminator'>): string {
    return [identity.language, identity.normalizedLemma, identity.partOfSpeech, identity.grammarDiscriminator].join('\u0000');
  }

  private exampleKey(lexemeId: string, language: string, normalizedText: string): string {
    return [lexemeId, language, normalizedText].join('\u0000');
  }

  private async projectInTransaction(
    manager: EntityManager,
    input: LegacyVocabularyProjectionInput,
    legacyDictionaryWordId?: string,
  ): Promise<VocabularyProjectionResult> {
    const identity = this.lexemeIdentity.createIdentity({
      language: input.targetLanguage,
      text: input.displayText,
      partOfSpeech: input.partOfSpeech,
      grammar: {
        article: input.article,
        gender: input.gender,
        plurals: [...input.plurals],
      },
    });
    const proposedLexemeId = stableResourceId(
      'lexeme',
      identity.language,
      identity.normalizedLemma,
      identity.partOfSpeech,
      identity.grammarDiscriminator,
    );
    const lexemeRepo = manager.getRepository(LexemeEntity);
    const lexemeValues = {
      id: proposedLexemeId,
      language: identity.language,
      normalizedLemma: identity.normalizedLemma,
      displayText: identity.displayText,
      partOfSpeech: identity.partOfSpeech,
      grammarDiscriminator: identity.grammarDiscriminator,
      grammar: {
        article: input.article,
        gender: input.gender,
        plurals: [...input.plurals],
      },
      phonetic: input.phonetic,
      cefrLevel: input.cefrLevel,
      source: input.source,
      model: input.model,
    };
    await lexemeRepo.createQueryBuilder()
      .insert()
      .values(lexemeValues)
      .orIgnore()
      .execute();
    await lexemeRepo.update({
      language: identity.language,
      normalizedLemma: identity.normalizedLemma,
      partOfSpeech: identity.partOfSpeech,
      grammarDiscriminator: identity.grammarDiscriminator,
    }, {
      displayText: identity.displayText,
      grammar: lexemeValues.grammar,
      phonetic: input.phonetic,
      cefrLevel: input.cefrLevel,
      source: input.source,
      model: input.model,
    });
    const lexeme = await lexemeRepo.findOneByOrFail({
      language: identity.language,
      normalizedLemma: identity.normalizedLemma,
      partOfSpeech: identity.partOfSpeech,
      grammarDiscriminator: identity.grammarDiscriminator,
    });
    if (legacyDictionaryWordId) {
      await manager.getRepository(LegacyDictionaryLexemeEntity).upsert({
        dictionaryWordId: legacyDictionaryWordId,
        lexemeId: lexeme.id,
      }, {
        conflictPaths: ['dictionaryWordId'],
        skipUpdateIfNoValuesChanged: true,
      });
    }

    const sourceLanguage = canonicalizeLanguageCode(input.sourceLanguage);
    const localizationId = stableResourceId('lexeme-localization', lexeme.id, sourceLanguage, '1');
    await manager.getRepository(LexemeLocalizationEntity).upsert({
      id: localizationId,
      lexemeId: lexeme.id,
      language: sourceLanguage,
      translation: input.translation,
      definition: input.definition ?? null,
      synonyms: input.synonyms.map(synonym => ({ ...synonym })),
      status: 'ready',
      contentVersion: 1,
      isActive: true,
      source: input.source,
      model: input.model,
    }, {
      conflictPaths: ['lexemeId', 'language', 'contentVersion'],
      skipUpdateIfNoValuesChanged: true,
    });

    let exampleCount = 0;
    for (let position = 0; position < input.examples.length; position += 1) {
      const example = input.examples[position];
      const targetText = example.target.normalize('NFC').trim().replace(/\s+/gu, ' ');
      if (!targetText) continue;
      const normalizedText = targetText.toLocaleLowerCase(identity.language);
      const proposedExampleId = stableResourceId(
        'example-sentence', lexeme.id, identity.language, normalizedText,
      );
      const exampleRepo = manager.getRepository(ExampleSentenceEntity);
      await exampleRepo.upsert({
        id: proposedExampleId,
        lexemeId: lexeme.id,
        language: identity.language,
        normalizedText,
        displayText: targetText,
        position,
        source: input.source,
        model: input.model,
      }, {
        conflictPaths: ['lexemeId', 'language', 'normalizedText'],
        skipUpdateIfNoValuesChanged: true,
      });
      const savedExample = await exampleRepo.findOneByOrFail({
        lexemeId: lexeme.id,
        language: identity.language,
        normalizedText,
      });

      const sourceText = example.source.normalize('NFC').trim().replace(/\s+/gu, ' ');
      if (sourceText) {
        await manager.getRepository(ExampleLocalizationEntity).upsert({
          id: stableResourceId('example-localization', savedExample.id, sourceLanguage, '1'),
          exampleSentenceId: savedExample.id,
          language: sourceLanguage,
          text: sourceText,
          status: 'ready',
          contentVersion: 1,
          isActive: true,
          source: input.source,
          model: input.model,
        }, {
          conflictPaths: ['exampleSentenceId', 'language', 'contentVersion'],
          skipUpdateIfNoValuesChanged: true,
        });
      }
      exampleCount += 1;
    }

    return { lexemeId: lexeme.id, localizationId, exampleCount };
  }
}
