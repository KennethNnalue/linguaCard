import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { LexemeIdentityService } from '../../vocabulary/domain/lexeme-identity.service';
import { LexemeEntity } from '../../vocabulary/entities/lexeme.entity';
import { LexemeLocalizationEntity } from '../../vocabulary/entities/lexeme-localization.entity';
import { PodcastTranscriptManifestService } from './podcast-transcript-manifest.service';

describe('PodcastTranscriptManifestService', () => {
  it('uses the retained German article to select a canonical noun identity', async () => {
    const feminineNoun = Object.assign(new LexemeEntity(), {
      id: 'wohnung-noun', language: 'de', normalizedLemma: 'wohnung', displayText: 'Wohnung',
      partOfSpeech: 'noun', grammarDiscriminator: 'article=die;gender=feminine', grammar: { article: 'die' },
    });
    const legacyOther = Object.assign(new LexemeEntity(), {
      id: 'wohnung-other', language: 'de', normalizedLemma: 'wohnung', displayText: 'Wohnung',
      partOfSpeech: 'other', grammarDiscriminator: '', grammar: {},
    });
    const lexemeRepository = { find: jest.fn().mockResolvedValue([feminineNoun, legacyOther]) };
    const localizationRepository = { find: jest.fn().mockResolvedValue([]) };
    const dataSource = {
      getRepository: jest.fn(entity => entity === LexemeEntity
        ? lexemeRepository
        : localizationRepository),
    };
    const module = await Test.createTestingModule({ providers: [
      PodcastTranscriptManifestService,
      LexemeIdentityService,
      { provide: DataSource, useValue: dataSource },
    ] }).compile();
    try {
      const preparation = await module.get(PodcastTranscriptManifestService).prepare(
        ['die Wohnung, -en'], 'de', 'en',
      );

      expect(preparation.ambiguities).toEqual([]);
      expect(preparation.manifest.items).toEqual([expect.objectContaining({
        key: 'wohnung', article: 'die', canonicalLexemeId: 'wohnung-noun',
      })]);
    } finally {
      await module.close();
    }
  });

  it('copies an existing canonical translation into the external prompt contract', async () => {
    const lexeme = Object.assign(new LexemeEntity(), {
      id: 'wohnung-noun', language: 'de', normalizedLemma: 'wohnung', displayText: 'Wohnung',
      partOfSpeech: 'noun', grammarDiscriminator: 'article=die;gender=feminine', grammar: { article: 'die' },
    });
    const localization = Object.assign(new LexemeLocalizationEntity(), {
      id: 'localization', lexemeId: lexeme.id, language: 'en', translation: 'Apartment', isActive: true,
    });
    const dataSource = {
      getRepository: jest.fn(entity => entity === LexemeEntity
        ? { find: jest.fn().mockResolvedValue([lexeme]) }
        : { find: jest.fn().mockResolvedValue([localization]) }),
    };
    const module = await Test.createTestingModule({ providers: [
      PodcastTranscriptManifestService,
      LexemeIdentityService,
      { provide: DataSource, useValue: dataSource },
    ] }).compile();
    try {
      const preparation = await module.get(PodcastTranscriptManifestService).prepare(
        ['die Wohnung, -en'], 'de', 'en',
      );

      expect(preparation.manifest.items).toEqual([expect.objectContaining({
        translation: 'Apartment', canonicalLexemeId: 'wohnung-noun',
      })]);
    } finally {
      await module.close();
    }
  });

  it('automatically selects the current canonical identity from equivalent duplicates', async () => {
    const legacy = Object.assign(new LexemeEntity(), {
      id: '668ec369359332c7430d8d687703bd10', language: 'de', normalizedLemma: 'besonders',
      displayText: 'besonders', partOfSpeech: 'other', grammarDiscriminator: '||',
      grammar: { article: null, gender: null, plurals: [] },
    });
    const current = Object.assign(new LexemeEntity(), {
      id: 'cc5504b3-d1b2-5af5-a31b-363befa1ba50', language: 'de', normalizedLemma: 'besonders',
      displayText: 'besonders', partOfSpeech: 'other', grammarDiscriminator: '',
      grammar: { article: null, gender: null, plurals: [] },
    });
    const localizations = [legacy, current].map(lexeme => Object.assign(new LexemeLocalizationEntity(), {
      id: `localization-${lexeme.id}`, lexemeId: lexeme.id, language: 'en',
      translation: 'especially', definition: null, isActive: true,
    }));
    const dataSource = {
      getRepository: jest.fn(entity => entity === LexemeEntity
        ? { find: jest.fn().mockResolvedValue([legacy, current]) }
        : { find: jest.fn().mockResolvedValue(localizations) }),
    };
    const module = await Test.createTestingModule({ providers: [
      PodcastTranscriptManifestService,
      LexemeIdentityService,
      { provide: DataSource, useValue: dataSource },
    ] }).compile();
    try {
      const preparation = await module.get(PodcastTranscriptManifestService).prepare(
        ['besonders'], 'de', 'en',
      );

      expect(preparation.ambiguities).toEqual([]);
      expect(preparation.manifest.items).toEqual([expect.objectContaining({
        canonicalLexemeId: current.id,
        translation: 'especially',
      })]);
    } finally {
      await module.close();
    }
  });

  it('returns genuine ambiguity candidates and accepts a valid administrator selection', async () => {
    const masculine = Object.assign(new LexemeEntity(), {
      id: '11111111-1111-5111-a111-111111111111', language: 'de', normalizedLemma: 'band',
      displayText: 'Band', partOfSpeech: 'noun',
      grammarDiscriminator: 'article=der;gender=masculine',
      grammar: { article: 'der', gender: 'masculine', plurals: [] },
    });
    const neuter = Object.assign(new LexemeEntity(), {
      id: '22222222-2222-5222-a222-222222222222', language: 'de', normalizedLemma: 'band',
      displayText: 'Band', partOfSpeech: 'noun',
      grammarDiscriminator: 'article=das;gender=neuter',
      grammar: { article: 'das', gender: 'neuter', plurals: [] },
    });
    const localizations = [
      Object.assign(new LexemeLocalizationEntity(), {
        id: 'localization-band', lexemeId: masculine.id, language: 'en',
        translation: 'volume', definition: 'A volume in a series.', isActive: true,
      }),
      Object.assign(new LexemeLocalizationEntity(), {
        id: 'localization-ribbon', lexemeId: neuter.id, language: 'en',
        translation: 'ribbon', definition: 'A narrow strip of material.', isActive: true,
      }),
    ];
    const dataSource = {
      getRepository: jest.fn(entity => entity === LexemeEntity
        ? { find: jest.fn().mockResolvedValue([masculine, neuter]) }
        : { find: jest.fn().mockResolvedValue(localizations) }),
    };
    const module = await Test.createTestingModule({ providers: [
      PodcastTranscriptManifestService,
      LexemeIdentityService,
      { provide: DataSource, useValue: dataSource },
    ] }).compile();
    try {
      const service = module.get(PodcastTranscriptManifestService);
      const unresolved = await service.prepare(['Band'], 'de', 'en');

      expect(unresolved.ambiguities).toEqual([expect.objectContaining({
        key: 'band',
        candidates: expect.arrayContaining([
          expect.objectContaining({ lexemeId: masculine.id, translation: 'volume', article: 'der' }),
          expect.objectContaining({ lexemeId: neuter.id, translation: 'ribbon', article: 'das' }),
        ]),
      })]);

      const resolved = await service.prepare(
        ['Band'], 'de', 'en', [{ key: 'band', lexemeId: neuter.id }],
      );

      expect(resolved.ambiguities).toEqual([]);
      expect(resolved.manifest.items[0]).toMatchObject({ canonicalLexemeId: neuter.id, translation: 'ribbon' });

      const correctedTranslation = await service.prepare(
        ['Band = book'], 'de', 'en', [{ key: 'band', lexemeId: neuter.id }],
      );
      expect(correctedTranslation.manifest.items[0]).toMatchObject({
        canonicalLexemeId: neuter.id,
        translation: 'ribbon',
      });

      const articleConflict = await service.prepare(['die Band'], 'de', 'en');
      expect(articleConflict.ambiguities).toEqual([expect.objectContaining({
        key: 'band', article: 'die', candidates: expect.arrayContaining([
          expect.objectContaining({ lexemeId: masculine.id }),
          expect.objectContaining({ lexemeId: neuter.id }),
        ]),
      })]);

      const confirmedArticleCorrection = await service.prepare(
        ['die Band'], 'de', 'en', [{ key: 'band', lexemeId: masculine.id }],
      );
      expect(confirmedArticleCorrection.ambiguities).toEqual([]);
      expect(confirmedArticleCorrection.manifest.items[0].canonicalLexemeId).toBe(masculine.id);
    } finally {
      await module.close();
    }
  });
});
