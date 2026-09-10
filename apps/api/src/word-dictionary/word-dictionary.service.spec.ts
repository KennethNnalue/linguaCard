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
    create: jest.fn(),
    upsertOnConflict: jest.fn(),
    save: jest.fn(),
  };
  const wordAudio = {resolve: jest.fn()};
  const vocabularyProjection = {project: jest.fn()};
  let service: WordDictionaryService;

  beforeEach(async () => {
    jest.resetAllMocks();
    repository.findByKey.mockResolvedValue(null);
    repository.create.mockImplementation((values: Partial<WordDictionaryEntity>) =>
      Object.assign(new WordDictionaryEntity(), values));
    repository.upsertOnConflict.mockImplementation((entity: WordDictionaryEntity) => Promise.resolve(entity));
    repository.save.mockImplementation((entity: WordDictionaryEntity) => Promise.resolve(entity));
    vocabularyProjection.project.mockResolvedValue({lexemeId: 'lexeme-1'});
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
});
