import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { LexemeIdentityService } from '../domain/lexeme-identity.service';
import { stableResourceId } from '../domain/stable-resource-id';
import { canonicalizeLanguageCode } from '../domain/language-code';
import { ExampleLocalizationEntity } from '../entities/example-localization.entity';
import { ExampleSentenceEntity } from '../entities/example-sentence.entity';
import { LexemeLocalizationEntity } from '../entities/lexeme-localization.entity';
import { LexemeEntity } from '../entities/lexeme.entity';
import { LegacyDictionaryLexemeEntity } from '../entities/legacy-dictionary-lexeme.entity';
import type {
  LegacyVocabularyProjectionInput,
  VocabularyProjectionResult,
} from '../models/vocabulary.types';

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
