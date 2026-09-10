jest.mock('../import/word-enrich.service', () => ({
  WordEnrichService: class WordEnrichService {},
}));
jest.mock('../word-audio/word-audio.service', () => ({
  WordAudioService: class WordAudioService {},
}));

import {Test} from '@nestjs/testing';
import type {EnrichedWordInput} from '@lingua-card/shared/domain';
import {WordEnrichService} from '../import/word-enrich.service';
import {WordAudioService} from '../word-audio/word-audio.service';
import {LegacyVocabularyProjectionService} from '../vocabulary/services/legacy-vocabulary-projection.service';
import {WordDictionaryEntity} from './word-dictionary.entity';
import {WordDictionaryRepository} from './word-dictionary.repository';
import {WordDictionaryService} from './word-dictionary.service';

function enrichedWord(): EnrichedWordInput {
  return {
    back: 'Apfel',
    front: 'apple',
    article: 'der',
    plural: 'Äpfel',
    cefrLevel: 'A1',
    wordType: 'noun',
    examples: [{target: 'Der Apfel ist rot.', native: 'The apple is red.'}],
    synonyms: [{word: 'Frucht', article: 'die', translation: 'fruit'}],
  };
}

describe('WordDictionaryService enriched content persistence', () => {
  const repository = {
    findByKey: jest.fn(),
    findByKeys: jest.fn(),
    create: jest.fn(),
    insertMissing: jest.fn(),
    upsertOnConflict: jest.fn(),
    save: jest.fn(),
  };
  const wordAudio = {resolve: jest.fn()};
  const vocabularyProjection = {project: jest.fn(), projectMany: jest.fn(), projectMissing: jest.fn()};
  let service: WordDictionaryService;

  beforeEach(async () => {
    jest.resetAllMocks();
    repository.findByKey.mockResolvedValue(null);
    repository.create.mockImplementation((values: Partial<WordDictionaryEntity>) =>
      Object.assign(new WordDictionaryEntity(), values));
    repository.upsertOnConflict.mockImplementation((entity: WordDictionaryEntity) => Promise.resolve(entity));
    repository.insertMissing.mockResolvedValue(undefined);
    repository.save.mockImplementation((entity: WordDictionaryEntity) => Promise.resolve(entity));
    vocabularyProjection.project.mockResolvedValue({lexemeId: 'lexeme-1'});
    vocabularyProjection.projectMany.mockResolvedValue(undefined);
    vocabularyProjection.projectMissing.mockResolvedValue(undefined);
    wordAudio.resolve.mockResolvedValue({
      wordAudio: {id: 'audio-1', status: 'ready'},
      cached: false,
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        WordDictionaryService,
        {provide: WordDictionaryRepository, useValue: repository},
        {provide: WordEnrichService, useValue: {enrichRaw: jest.fn()}},
        {provide: WordAudioService, useValue: wordAudio},
        {provide: LegacyVocabularyProjectionService, useValue: vocabularyProjection},
      ],
    }).compile();
    service = moduleRef.get(WordDictionaryService);
  });

  it('persists enriched lexical content without requesting audio', async () => {
    const saved = await service.persistEnrichedContent(enrichedWord());

    expect(saved).toEqual(expect.objectContaining({
      displayText: 'Apfel',
      translation: 'apple',
      wordAudioId: null,
    }));
    expect(wordAudio.resolve).not.toHaveBeenCalled();
    expect(vocabularyProjection.project).toHaveBeenCalledTimes(1);
  });

  it('keeps immediate audio generation available through the compatibility operation', async () => {
    const saved = await service.persistEnriched(enrichedWord());

    expect(wordAudio.resolve).toHaveBeenCalledWith('der Apfel', 'de-DE');
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({wordAudioId: 'audio-1'}));
    expect(saved.wordAudioId).toBe('audio-1');
  });

  it('persists and projects enriched content through set-based batch operations', async () => {
    repository.findByKeys
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(new Map([[
        'der apfel',
        Object.assign(new WordDictionaryEntity(), {
          id: 'dictionary-1',
          lemmaKey: 'der apfel',
          targetLang: 'de-DE',
          nativeLang: 'en',
          displayText: 'Apfel',
          article: 'der',
          wordType: 'noun',
          translation: 'apple',
          examples: [],
          synonyms: [],
          plurals: ['Äpfel'],
          wordAudioId: null,
          source: 'admin',
        }),
      ]]));

    const result = await service.persistEnrichedContentBatch([
      enrichedWord(),
      {...enrichedWord(), back: 'apfel'},
    ]);

    expect(repository.findByKeys).toHaveBeenCalledTimes(2);
    expect(repository.insertMissing).toHaveBeenCalledWith([
      expect.objectContaining({lemmaKey: 'der apfel', wordAudioId: null}),
    ]);
    expect(vocabularyProjection.projectMissing).toHaveBeenCalledWith([
      expect.objectContaining({legacyDictionaryWordId: 'dictionary-1'}),
    ]);
    expect(vocabularyProjection.projectMany).not.toHaveBeenCalled();
    expect(wordAudio.resolve).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      inserted: 1,
      reused: 0,
      duplicatesSkipped: 1,
    }));
  });
});
