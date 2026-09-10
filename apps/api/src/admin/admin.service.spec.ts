jest.mock('../word-dictionary/word-dictionary.service', () => ({
  WordDictionaryService: class WordDictionaryService {},
}));
jest.mock('../word-audio/word-audio.service', () => ({
  WordAudioService: class WordAudioService {},
}));
jest.mock('../storage/storage.service', () => ({
  StorageService: class StorageService {},
}));

import type {AdminImportCollectionJsonDto, EnrichedWordInput} from '@lingua-card/shared/domain';
import {AdminService} from './admin.service';

describe('AdminService collection import staging', () => {
  it('commits a deduplicated enriched JSON draft without generating TTS', async () => {
    const dictionaryEntry = {
      id: 'dictionary-1',
      article: 'der',
      displayText: 'Apfel',
      translation: 'apple',
      examples: [{id: 'example-1', target: 'Der Apfel ist rot.', native: 'The apple is red.'}],
      targetLang: 'de-DE',
      nativeLang: 'en',
      wordAudioId: null,
    };
    const transactionManager = {save: jest.fn().mockResolvedValue(undefined)};
    const collectionRepo = {
      create: jest.fn(value => value),
      findOneBy: jest.fn().mockResolvedValue({id: 'collection-1', isPublished: false, status: 'draft'}),
      save: jest.fn(value => Promise.resolve(value)),
      manager: {transaction: jest.fn(callback => callback(transactionManager))},
    };
    const wordRepo = {
      create: jest.fn(value => value),
      find: jest.fn().mockResolvedValue([{dictionaryWordId: 'dictionary-1'}]),
    };
    const dictRepo = {findBy: jest.fn().mockResolvedValue([dictionaryEntry])};
    const importRepo = {findOneBy: jest.fn().mockResolvedValue(null)};
    const dictionary = {
      lookup: jest.fn().mockResolvedValue(null),
      persistEnrichedContent: jest.fn().mockResolvedValue(dictionaryEntry),
    };
    const wordAudio = {
      batchResolve: jest.fn().mockResolvedValue({
        results: [{
          wordAudio: {status: 'pending'},
          cached: false,
        }],
        generated: 0,
        reused: 0,
      }),
    };
    const dictionaryLexemeRepo = {
      findOneBy: jest.fn().mockResolvedValue({dictionaryWordId: 'dictionary-1', lexemeId: 'lexeme-1'}),
    };
    const service = new AdminService(
      collectionRepo as never,
      wordRepo as never,
      {} as never,
      {} as never,
      dictRepo as never,
      importRepo as never,
      dictionaryLexemeRepo as never,
      dictionary as never,
      wordAudio as never,
      {} as never,
      {} as never,
    );
    const word: EnrichedWordInput = {
      back: 'Apfel',
      front: 'apple',
      article: 'der',
      plural: 'Äpfel',
      cefrLevel: 'A1',
      wordType: 'noun',
      examples: [{target: 'Der Apfel ist rot.', native: 'The apple is red.'}],
      synonyms: [{word: 'Frucht', article: 'die', translation: 'fruit'}],
    };
    const dto: AdminImportCollectionJsonDto = {
      title: 'Fruit',
      level: 'A1',
      words: [word, {...word}],
    };

    const result = await service.importCollectionJson(dto);

    expect(dictionary.persistEnrichedContent).toHaveBeenCalledTimes(2);
    expect(wordAudio.batchResolve).not.toHaveBeenCalled();
    expect(transactionManager.save).toHaveBeenCalledTimes(2);
    expect(transactionManager.save).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({status: 'needs_attention'}),
    );
    expect(transactionManager.save).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      [expect.objectContaining({lexemeId: 'lexeme-1', position: 0})],
    );
    expect(result).toEqual(expect.objectContaining({
      inserted: 1,
      reused: 0,
      audioLinked: 0,
      duplicatesSkipped: 1,
    }));
  });
});
