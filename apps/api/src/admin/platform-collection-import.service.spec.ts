import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { AdminPlatformCollectionImportPayload } from '@lingua-card/shared/domain';
import { WordDictionaryService } from '../word-dictionary/word-dictionary.service';
import { WordAudioService } from '../word-audio/word-audio.service';
import { LexemeIdentityService } from '../vocabulary/domain/lexeme-identity.service';
import { SpeechIdentityService } from '../vocabulary/domain/speech-identity.service';
import { LegacyVocabularyProjectionService } from '../vocabulary/services/legacy-vocabulary-projection.service';
import { PlatformCollectionImportRepository } from './platform-collection-import.repository';
import { PlatformCollectionImportService } from './platform-collection-import.service';

function createPayload(): AdminPlatformCollectionImportPayload {
  return {
    schemaVersion: 2,
    fileName: 'travel.json',
    collection: {
      externalId: 'a1-travel',
      title: 'Travel Basics',
      description: 'Useful travel language.',
      sourceLanguage: 'en',
      targetLanguage: 'de',
      level: 'A1',
      topic: 'travel',
      cover: { mode: 'derived' },
    },
    items: [{
      position: 1,
      lexeme: {
        text: 'Bahnhof',
        partOfSpeech: 'noun',
        grammar: { article: 'der', gender: 'masculine', plurals: ['Bahnhöfe'] },
        phonetic: null,
        cefrLevel: 'A1',
      },
      localization: {
        language: 'en',
        translation: 'train station',
        definition: 'A place where trains stop.',
      },
      examples: [{ targetText: 'Wo ist der Bahnhof?', sourceText: 'Where is the train station?' }],
    }],
  };
}

describe('PlatformCollectionImportService', () => {
  const dictionaryPersist = jest.fn();
  let service: PlatformCollectionImportService;

  beforeEach(async () => {
    dictionaryPersist.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlatformCollectionImportService,
        LexemeIdentityService,
        SpeechIdentityService,
        { provide: ConfigService, useValue: { get: () => ({ googleCloudTtsVoice: 'de-DE-test' }) } },
        { provide: WordDictionaryService, useValue: { persistEnriched: dictionaryPersist } },
        { provide: WordAudioService, useValue: { batchResolve: jest.fn() } },
        { provide: LegacyVocabularyProjectionService, useValue: { project: jest.fn() } },
        {
          provide: PlatformCollectionImportRepository,
          useValue: {
            findLanguages: async () => [
              { code: 'en', isSourceEnabled: true, isTargetEnabled: false },
              { code: 'de', isSourceEnabled: false, isTargetEnabled: true },
            ],
            findCollectionByExternalId: async () => null,
            findLexemes: async () => [],
            findActiveLocalizations: async () => [],
            findReadySpeechIdentityKeys: async () => new Set<string>(),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(PlatformCollectionImportService);
  });

  it('validates deterministically without persisting vocabulary', async () => {
    const first = await service.validate(createPayload());
    const second = await service.validate(createPayload());

    expect(first.status).toBe('valid');
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.counts).toEqual({ items: 1, reused: 0, new: 1, conflicts: 0 });
    expect(first.readiness).toEqual({
      metadataReady: true,
      lexemesResolved: 1,
      localizationsReady: 1,
      targetAudioReady: 0,
      targetAudioRequired: 2,
    });
    expect(dictionaryPersist).not.toHaveBeenCalled();
  });

  it('reports stable pointers for duplicate positions and lexical identities', async () => {
    const payload = createPayload();
    payload.items.push({ ...payload.items[0], examples: [], position: 1 });

    const preview = await service.validate(payload);

    expect(preview.status).toBe('conflicts');
    expect(preview.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'duplicate-position', pointer: '/items/1/position' }),
      expect.objectContaining({ code: 'duplicate-lexeme', pointer: '/items/1/lexeme' }),
    ]));
    expect(dictionaryPersist).not.toHaveBeenCalled();
  });
});
