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
      const manifest = await module.get(PodcastTranscriptManifestService).create(
        ['die Wohnung, -en'], 'de', 'en',
      );

      expect(manifest.items).toEqual([expect.objectContaining({
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
      const manifest = await module.get(PodcastTranscriptManifestService).create(
        ['die Wohnung, -en'], 'de', 'en',
      );

      expect(manifest.items).toEqual([expect.objectContaining({
        translation: 'Apartment', canonicalLexemeId: 'wohnung-noun',
      })]);
    } finally {
      await module.close();
    }
  });
});
