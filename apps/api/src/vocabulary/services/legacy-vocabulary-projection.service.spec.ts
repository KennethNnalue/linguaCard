import { Test } from '@nestjs/testing';
import { DataSource, EntityManager } from 'typeorm';
import { LexemeIdentityService } from '../domain/lexeme-identity.service';
import { ExampleLocalizationEntity } from '../entities/example-localization.entity';
import { ExampleSentenceEntity } from '../entities/example-sentence.entity';
import { LegacyDictionaryLexemeEntity } from '../entities/legacy-dictionary-lexeme.entity';
import { LexemeEntity } from '../entities/lexeme.entity';
import { LexemeLocalizationEntity } from '../entities/lexeme-localization.entity';
import type { LegacyVocabularyProjectionInput } from '../models/vocabulary.types';
import { LegacyVocabularyProjectionService } from './legacy-vocabulary-projection.service';

function queryBuilder() {
  return {
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orUpdate: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({}),
  };
}

function input(displayText: string, translation: string): LegacyVocabularyProjectionInput {
  return {
    targetLanguage: 'de-DE',
    sourceLanguage: 'en',
    displayText,
    article: 'der',
    gender: 'masculine',
    translation,
    partOfSpeech: 'noun',
    phonetic: null,
    cefrLevel: 'A1',
    plurals: [],
    examples: [{ target: `Der ${displayText} ist hier.`, source: `The ${translation} is here.` }],
    synonyms: [],
    source: 'admin',
    model: null,
  };
}

describe('LegacyVocabularyProjectionService batch projection', () => {
  const mappingRepository = { findBy: jest.fn(), upsert: jest.fn() };
  const lexemeQuery = queryBuilder();
  const lexemeRepository = { createQueryBuilder: jest.fn(() => lexemeQuery), find: jest.fn() };
  const localizationRepository = { upsert: jest.fn() };
  const exampleQuery = queryBuilder();
  const exampleRepository = { createQueryBuilder: jest.fn(() => exampleQuery), find: jest.fn() };
  const exampleLocalizationRepository = { upsert: jest.fn() };
  const manager = {
    getRepository: jest.fn((entity: object) => {
      if (entity === LegacyDictionaryLexemeEntity) return mappingRepository;
      if (entity === LexemeEntity) return lexemeRepository;
      if (entity === LexemeLocalizationEntity) return localizationRepository;
      if (entity === ExampleSentenceEntity) return exampleRepository;
      if (entity === ExampleLocalizationEntity) return exampleLocalizationRepository;
      throw new Error('Unexpected repository');
    }),
  };
  const dataSource = {
    transaction: jest.fn((work: (entityManager: EntityManager) => Promise<void>) =>
      work(manager as unknown as EntityManager)),
  };
  let service: LegacyVocabularyProjectionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        LegacyVocabularyProjectionService,
        LexemeIdentityService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(LegacyVocabularyProjectionService);
  });

  it('skips every write when all dictionary entries already have projections', async () => {
    mappingRepository.findBy.mockResolvedValue([
      { dictionaryWordId: 'dictionary-1', lexemeId: 'lexeme-1' },
    ]);

    await service.projectMissing([{
      input: input('Hund', 'dog'),
      legacyDictionaryWordId: 'dictionary-1',
    }]);

    expect(mappingRepository.findBy).toHaveBeenCalledTimes(1);
    expect(lexemeRepository.createQueryBuilder).not.toHaveBeenCalled();
    expect(mappingRepository.upsert).not.toHaveBeenCalled();
  });

  it('writes a fresh multi-word projection in set-based operations', async () => {
    mappingRepository.findBy.mockResolvedValue([]);
    lexemeRepository.find.mockResolvedValue([
      {
        id: 'lexeme-hund', language: 'de', normalizedLemma: 'hund',
        displayText: 'Hund', partOfSpeech: 'noun',
        grammarDiscriminator: 'article=der;gender=masculine',
      },
      {
        id: 'lexeme-apfel', language: 'de', normalizedLemma: 'apfel',
        displayText: 'Apfel', partOfSpeech: 'noun',
        grammarDiscriminator: 'article=der;gender=masculine',
      },
    ]);
    exampleRepository.find.mockResolvedValue([
      {
        id: 'example-hund', lexemeId: 'lexeme-hund', language: 'de',
        normalizedText: 'der hund ist hier.',
      },
      {
        id: 'example-apfel', lexemeId: 'lexeme-apfel', language: 'de',
        normalizedText: 'der apfel ist hier.',
      },
    ]);

    await service.projectMissing([
      { input: input('Hund', 'dog'), legacyDictionaryWordId: 'dictionary-1' },
      { input: input('Apfel', 'apple'), legacyDictionaryWordId: 'dictionary-2' },
    ]);

    expect(lexemeQuery.execute).toHaveBeenCalledTimes(1);
    expect(mappingRepository.upsert).toHaveBeenCalledWith(expect.arrayContaining([
      { dictionaryWordId: 'dictionary-1', lexemeId: 'lexeme-hund' },
      { dictionaryWordId: 'dictionary-2', lexemeId: 'lexeme-apfel' },
    ]), expect.any(Object));
    expect(localizationRepository.upsert).toHaveBeenCalledTimes(1);
    expect(exampleQuery.execute).toHaveBeenCalledTimes(1);
    expect(exampleLocalizationRepository.upsert).toHaveBeenCalledTimes(1);
  });
});
