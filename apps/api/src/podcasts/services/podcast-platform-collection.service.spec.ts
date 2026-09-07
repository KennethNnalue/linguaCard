import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PlatformCollectionEntity } from '../../admin/platform-collection.entity';
import { PlatformCollectionWordEntity } from '../../admin/platform-collection-word.entity';
import { CanonicalDictionaryProjectionService } from '../../word-dictionary/canonical-dictionary-projection.service';
import { ExampleLocalizationEntity } from '../../vocabulary/entities/example-localization.entity';
import { ExampleSentenceEntity } from '../../vocabulary/entities/example-sentence.entity';
import { LanguageEntity } from '../../vocabulary/entities/language.entity';
import { LexemeEntity } from '../../vocabulary/entities/lexeme.entity';
import { LexemeLocalizationEntity } from '../../vocabulary/entities/lexeme-localization.entity';
import { PodcastEpisodeEntity } from '../entities/podcast-episode.entity';
import { PodcastEpisodeVocabularyEntity } from '../entities/podcast-episode-vocabulary.entity';
import { PodcastTopicEntity } from '../entities/podcast-topic.entity';
import { PodcastPlatformCollectionService } from './podcast-platform-collection.service';

function episode(status: PodcastEpisodeEntity['status'] = 'published'): PodcastEpisodeEntity {
  return Object.assign(new PodcastEpisodeEntity(), {
    id: 'episode-1', topicId: 'topic-1', externalId: 'cafe-episode-1', title: 'Ordering coffee',
    titleTranslation: 'Ordering coffee', description: '', level: 'A1' as const, position: 0,
    status, thumbnailAssetId: null, audioUrl: '/episode.mp3', audioStoragePath: 'episode.mp3',
    audioDurationMs: 1000, contentVersion: 1, audioVersion: 1, transcriptFingerprint: 'fingerprint',
    estimatedDurationMs: 1000, generationError: null, generationRequestId: null,
    generationInput: null, elevenLabsProjectId: null, createdAt: new Date(0),
    updatedAt: new Date(0), publishedAt: new Date(0),
  });
}

function topic(): PodcastTopicEntity {
  return Object.assign(new PodcastTopicEntity(), {
    id: 'topic-1', externalId: 'cafe', title: 'At the café', description: '',
    targetLanguage: 'de' as const, translationLanguage: 'en' as const, level: 'A1' as const,
    status: 'published' as const, thumbnailAssetId: null, createdAt: new Date(0),
    updatedAt: new Date(0), publishedAt: new Date(0),
  });
}

describe('PodcastPlatformCollectionService', () => {
  const episodeRepo = { findOneBy: jest.fn() };
  const topicRepo = { findOneBy: jest.fn() };
  const collectionRepo = { findOneBy: jest.fn() };
  const vocabularyRepo = { find: jest.fn() };
  const lexemeRepo = { findBy: jest.fn() };
  const localizationRepo = { findBy: jest.fn() };
  const languageRepo = { findOneBy: jest.fn() };
  const exampleRepo = { find: jest.fn() };
  const exampleLocalizationRepo = { findBy: jest.fn() };
  const thumbnailRepo = { findOneBy: jest.fn() };
  const manager = {
    query: jest.fn(), findOneBy: jest.fn(), findOne: jest.fn(), find: jest.fn(),
    create: jest.fn(), save: jest.fn(),
  };
  const dataSource = { getRepository: jest.fn(), transaction: jest.fn() };
  const dictionaryProjection = { projectMany: jest.fn() };
  let service: PodcastPlatformCollectionService;

  beforeEach(async () => {
    jest.resetAllMocks();
    dataSource.getRepository.mockImplementation(entity => {
      if (entity === PodcastEpisodeEntity) return episodeRepo;
      if (entity === PodcastTopicEntity) return topicRepo;
      if (entity === PlatformCollectionEntity) return collectionRepo;
      if (entity === PodcastEpisodeVocabularyEntity) return vocabularyRepo;
      if (entity === LexemeEntity) return lexemeRepo;
      if (entity === LexemeLocalizationEntity) return localizationRepo;
      if (entity === LanguageEntity) return languageRepo;
      if (entity === ExampleSentenceEntity) return exampleRepo;
      if (entity === ExampleLocalizationEntity) return exampleLocalizationRepo;
      return thumbnailRepo;
    });
    const module = await Test.createTestingModule({ providers: [
      PodcastPlatformCollectionService,
      { provide: DataSource, useValue: dataSource },
      { provide: CanonicalDictionaryProjectionService, useValue: dictionaryProjection },
    ] }).compile();
    service = module.get(PodcastPlatformCollectionService);
  });

  it('rejects an unpublished episode before creating dictionary content', async () => {
    episodeRepo.findOneBy.mockResolvedValue(episode('draft'));

    await expect(service.publish('episode-1')).rejects.toBeInstanceOf(ConflictException);
    expect(dictionaryProjection.projectMany).not.toHaveBeenCalled();
  });

  it('rejects an episode with no essential vocabulary', async () => {
    episodeRepo.findOneBy.mockResolvedValue(episode());
    topicRepo.findOneBy.mockResolvedValue(topic());
    collectionRepo.findOneBy.mockResolvedValue(null);
    vocabularyRepo.find.mockResolvedValue([]);

    await expect(service.publish('episode-1')).rejects.toThrow(
      'The podcast episode has no essential vocabulary',
    );
  });

  it('returns the existing source collection without projecting vocabulary again', async () => {
    const existing = Object.assign(new PlatformCollectionEntity(), {
      id: 'collection-1', title: 'Podcast · Ordering coffee', externalId: 'podcast-existing',
      description: '', sourceLanguage: 'en', targetLanguage: 'de', coverSeed: 'seed',
      coverImageUrl: null, emoji: '🎙️', level: 'A1', topic: 'At the café',
      isPublished: true, status: 'published', wordCount: 4,
      sourcePodcastEpisodeId: 'episode-1', storyCategory: null,
      publishedAt: new Date(0), createdAt: new Date(0), updatedAt: new Date(0),
    });
    episodeRepo.findOneBy.mockResolvedValue(episode());
    topicRepo.findOneBy.mockResolvedValue(topic());
    collectionRepo.findOneBy.mockResolvedValue(existing);

    await expect(service.publish('episode-1')).resolves.toEqual(expect.objectContaining({
      created: false,
      essentialCount: 4,
      dictionaryReused: 0,
      dictionaryCreated: 0,
    }));
    expect(vocabularyRepo.find).not.toHaveBeenCalled();
    expect(dictionaryProjection.projectMany).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('publishes one ordered essential vocabulary collection', async () => {
    const link = Object.assign(new PodcastEpisodeVocabularyEntity(), {
      id: 'link-1', episodeId: 'episode-1', lexemeId: 'lexeme-1',
      vocabularyKey: 'kaffee', position: 2, importance: 'essential' as const,
    });
    const lexeme = Object.assign(new LexemeEntity(), {
      id: 'lexeme-1', language: 'de', normalizedLemma: 'kaffee', displayText: 'Kaffee',
      partOfSpeech: 'other', grammarDiscriminator: '',
      grammar: { article: null, gender: null, plurals: [] }, phonetic: null, cefrLevel: 'A1',
      source: 'admin' as const, model: null, createdAt: new Date(0), updatedAt: new Date(0),
    });
    const localization = Object.assign(new LexemeLocalizationEntity(), {
      id: 'localization-1', lexemeId: 'lexeme-1', language: 'en', translation: 'coffee',
      definition: null, synonyms: [], status: 'ready' as const, contentVersion: 1,
      isActive: true, source: 'admin' as const, model: null,
      createdAt: new Date(0), updatedAt: new Date(0),
    });
    episodeRepo.findOneBy.mockResolvedValue(episode());
    topicRepo.findOneBy.mockResolvedValue(topic());
    collectionRepo.findOneBy.mockResolvedValue(null);
    vocabularyRepo.find.mockResolvedValue([link]);
    lexemeRepo.findBy.mockResolvedValue([lexeme]);
    localizationRepo.findBy.mockResolvedValue([localization]);
    languageRepo.findOneBy.mockResolvedValue(Object.assign(new LanguageEntity(), {
      code: 'de', displayName: 'German', defaultLocale: 'de-DE', textDirection: 'ltr' as const,
      isSourceEnabled: false, isTargetEnabled: true, targetSpeechPolicy: 'synthesized' as const,
      sourceSpeechPolicy: 'device' as const,
    }));
    exampleRepo.find.mockResolvedValue([]);
    dictionaryProjection.projectMany.mockResolvedValue([{
      dictionaryWordId: 'dictionary-1', reused: true, audio: 'reused',
    }]);
    manager.findOneBy
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(topic());
    manager.findOne.mockResolvedValue(episode());
    manager.find.mockResolvedValue([link]);
    manager.create.mockImplementation((entity, values) => {
      if (entity === PlatformCollectionEntity) {
        return Object.assign(new PlatformCollectionEntity(), values, {
          createdAt: new Date(0), updatedAt: new Date(0),
        });
      }
      return Object.assign(new PlatformCollectionWordEntity(), values, { createdAt: new Date(0) });
    });
    manager.save.mockImplementation(value => Promise.resolve(value));
    dataSource.transaction.mockImplementation(callback => callback(manager));

    const result = await service.publish('episode-1');

    expect(result).toEqual(expect.objectContaining({
      created: true, essentialCount: 1, dictionaryReused: 1, dictionaryCreated: 0,
      audioReused: 1, audioGenerated: 0,
    }));
    expect(vocabularyRepo.find).toHaveBeenCalledWith({
      where: { episodeId: 'episode-1', importance: 'essential' },
      order: { position: 'ASC' },
    });
    expect(manager.save).toHaveBeenCalledWith([expect.objectContaining({
      platformCollectionId: expect.any(String), dictionaryWordId: 'dictionary-1',
      lexemeId: 'lexeme-1', position: 2,
    })]);
  });
});
