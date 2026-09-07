import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { WordAudioService } from '../word-audio/word-audio.service';
import { LegacyDictionaryLexemeEntity } from '../vocabulary/entities/legacy-dictionary-lexeme.entity';
import { LexemeEntity } from '../vocabulary/entities/lexeme.entity';
import { LexemeLocalizationEntity } from '../vocabulary/entities/lexeme-localization.entity';
import {
  CanonicalDictionaryProjectionService,
  type CanonicalDictionaryProjectionInput,
} from './canonical-dictionary-projection.service';
import { WordDictionaryEntity } from './word-dictionary.entity';

function createInput(): CanonicalDictionaryProjectionInput {
  const lexeme = Object.assign(new LexemeEntity(), {
    id: 'lexeme-1', language: 'de', normalizedLemma: 'kaffee', displayText: 'Kaffee',
    partOfSpeech: 'noun', grammarDiscriminator: 'article=der;gender=masculine',
    grammar: { article: 'der', gender: 'masculine', plurals: ['Kaffees'] },
    phonetic: null, cefrLevel: 'A1', source: 'admin' as const, model: null,
    createdAt: new Date(0), updatedAt: new Date(0),
  });
  const localization = Object.assign(new LexemeLocalizationEntity(), {
    id: 'localization-1', lexemeId: lexeme.id, language: 'en', translation: 'coffee',
    definition: null, synonyms: [], status: 'ready' as const, contentVersion: 1,
    isActive: true, source: 'admin' as const, model: null,
    createdAt: new Date(0), updatedAt: new Date(0),
  });
  return { lexeme, localization, targetLocale: 'de-DE', examples: [] };
}

function createDictionaryWord(): WordDictionaryEntity {
  return Object.assign(new WordDictionaryEntity(), {
    id: 'dictionary-1', lemmaKey: 'der kaffee', targetLang: 'de-DE', nativeLang: 'en',
    displayText: 'Kaffee', article: 'der' as const, gender: 'masculine' as const,
    translation: 'coffee', wordType: 'noun' as const, phonetic: null, cefrLevel: 'A1' as const,
    categoryName: 'Podcast', examples: [], synonyms: [], plurals: ['Kaffees'],
    wordAudioId: 'audio-1', source: 'admin' as const, model: 'podcast-platform-collection',
    enrichedAt: new Date(0), updatedAt: new Date(0),
  });
}

describe('CanonicalDictionaryProjectionService', () => {
  const dictionaryRepo = {
    find: jest.fn(), findOneBy: jest.fn(), create: jest.fn(), save: jest.fn(),
  };
  const mappingRepo = {
    findBy: jest.fn(), findOneBy: jest.fn(), create: jest.fn(), save: jest.fn(),
  };
  const dataSource = {
    getRepository: jest.fn((entity: object) => entity === WordDictionaryEntity
      ? dictionaryRepo
      : mappingRepo),
  };
  const wordAudio = { batchResolve: jest.fn() };
  let service: CanonicalDictionaryProjectionService;

  beforeEach(async () => {
    jest.resetAllMocks();
    dataSource.getRepository.mockImplementation((entity: object) => entity === WordDictionaryEntity
      ? dictionaryRepo
      : mappingRepo);
    dictionaryRepo.create.mockImplementation(value => Object.assign(new WordDictionaryEntity(), value));
    dictionaryRepo.save.mockImplementation(value => Promise.resolve(value));
    mappingRepo.create.mockImplementation(value => Object.assign(new LegacyDictionaryLexemeEntity(), value));
    mappingRepo.save.mockImplementation(value => Promise.resolve(value));
    mappingRepo.findBy.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        CanonicalDictionaryProjectionService,
        { provide: DataSource, useValue: dataSource },
        { provide: WordAudioService, useValue: wordAudio },
      ],
    }).compile();
    service = module.get(CanonicalDictionaryProjectionService);
  });

  it('reuses an existing mapped dictionary word and verifies cached audio', async () => {
    const dictionaryWord = createDictionaryWord();
    dictionaryRepo.find.mockResolvedValueOnce([dictionaryWord]);
    mappingRepo.findBy.mockResolvedValueOnce([{
      dictionaryWordId: dictionaryWord.id, lexemeId: 'lexeme-1', createdAt: new Date(0),
    }]);
    wordAudio.batchResolve.mockResolvedValue({
      results: [{ wordAudio: {
        id: 'audio-1', normalizedText: 'der kaffee', displayText: 'der Kaffee', language: 'de-DE',
        audioUrl: '/audio.mp3', durationMs: 500, status: 'ready', retryAfterMs: null,
      }, cached: true }],
      generated: 0, reused: 1,
    });

    await expect(service.project(createInput())).resolves.toEqual({
      dictionaryWordId: dictionaryWord.id,
      reused: true,
      audio: 'reused',
    });
    expect(dictionaryRepo.find).toHaveBeenCalledWith({ where: [{
      lemmaKey: 'der kaffee', targetLang: 'de-DE', nativeLang: 'en',
    }] });
    expect(wordAudio.batchResolve).toHaveBeenCalledWith([
      { text: 'der Kaffee', language: 'de-DE' },
    ]);
  });

  it('creates dictionary content from canonical data without enrichment', async () => {
    dictionaryRepo.find.mockResolvedValueOnce([]);
    wordAudio.batchResolve.mockResolvedValue({
      results: [{ wordAudio: {
        id: 'audio-1', normalizedText: 'der kaffee', displayText: 'der Kaffee', language: 'de-DE',
        audioUrl: '/audio.mp3', durationMs: 500, status: 'ready', retryAfterMs: null,
      }, cached: true }],
      generated: 0, reused: 1,
    });

    const result = await service.project(createInput());

    expect(result).toEqual({
      dictionaryWordId: expect.any(String), reused: false, audio: 'reused',
    });
    expect(dictionaryRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      displayText: 'Kaffee', translation: 'coffee', article: 'der', wordType: 'noun',
      source: 'admin', model: 'podcast-platform-collection',
    }));
    expect(mappingRepo.save).toHaveBeenCalledWith(expect.objectContaining({ lexemeId: 'lexeme-1' }));
  });

  it('rejects a dictionary row already linked to another lexeme', async () => {
    const dictionaryWord = createDictionaryWord();
    dictionaryRepo.find.mockResolvedValueOnce([dictionaryWord]);
    mappingRepo.findBy.mockResolvedValueOnce([{
      dictionaryWordId: dictionaryWord.id, lexemeId: 'lexeme-2', createdAt: new Date(0),
    }]);

    await expect(service.project(createInput())).rejects.toBeInstanceOf(ConflictException);
    expect(wordAudio.batchResolve).not.toHaveBeenCalled();
  });

  it('resolves multiple dictionary projections with bulk reads and one audio batch', async () => {
    const firstInput = createInput();
    const secondInput = createInput();
    secondInput.lexeme = Object.assign(new LexemeEntity(), {
      ...secondInput.lexeme,
      id: 'lexeme-2',
      normalizedLemma: 'tee',
      displayText: 'Tee',
      grammarDiscriminator: 'article=der;gender=masculine',
    });
    secondInput.localization = Object.assign(new LexemeLocalizationEntity(), {
      ...secondInput.localization,
      id: 'localization-2',
      lexemeId: 'lexeme-2',
      translation: 'tea',
    });
    const firstWord = createDictionaryWord();
    const secondWord = Object.assign(createDictionaryWord(), {
      id: 'dictionary-2', lemmaKey: 'der tee', displayText: 'Tee', translation: 'tea',
    });
    dictionaryRepo.find.mockResolvedValueOnce([firstWord, secondWord]);
    mappingRepo.findBy.mockResolvedValueOnce([
      { dictionaryWordId: firstWord.id, lexemeId: 'lexeme-1', createdAt: new Date(0) },
      { dictionaryWordId: secondWord.id, lexemeId: 'lexeme-2', createdAt: new Date(0) },
    ]);
    wordAudio.batchResolve.mockResolvedValue({
      results: [firstWord, secondWord].map(word => ({
        wordAudio: {
          id: 'audio-1', normalizedText: word.lemmaKey, displayText: word.displayText,
          language: 'de-DE', audioUrl: '/audio.mp3', durationMs: 500,
          status: 'ready', retryAfterMs: null,
        },
        cached: true,
      })),
      generated: 0,
      reused: 2,
    });

    await expect(service.projectMany([firstInput, secondInput])).resolves.toHaveLength(2);

    expect(dictionaryRepo.find).toHaveBeenCalledTimes(1);
    expect(mappingRepo.findBy).toHaveBeenCalledTimes(1);
    expect(wordAudio.batchResolve).toHaveBeenCalledTimes(1);
  });
});
