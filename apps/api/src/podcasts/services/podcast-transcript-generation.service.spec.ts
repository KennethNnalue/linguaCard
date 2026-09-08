import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { OpenRouterAdapter } from '../../ai/providers/openrouter.adapter';
import { PodcastEpisodeEntity } from '../entities/podcast-episode.entity';
import { PodcastTopicEntity } from '../entities/podcast-topic.entity';
import { PodcastTranscriptGenerationService } from './podcast-transcript-generation.service';
import { PodcastTranscriptImportService } from './podcast-transcript-import.service';
import { PodcastTranscriptManifestService } from './podcast-transcript-manifest.service';
import { createPodcastTranscriptManifestDraft } from '../domain/podcast-transcript-manifest';

describe('PodcastTranscriptGenerationService prompt', () => {
  it('persists supplied vocabulary so the later import can enforce it', async () => {
    const manifest = createPodcastTranscriptManifestDraft(['die Vermieterin, -nen', 'bald'], 'de', 'en');
    const episode = Object.assign(new PodcastEpisodeEntity(), {
      id: 'episode', topicId: 'topic', generationInput: null,
    });
    const topic = Object.assign(new PodcastTopicEntity(), {
      id: 'topic', title: 'Meine Wohnung', description: '',
      targetLanguage: 'de', translationLanguage: 'en', level: 'A1',
    });
    const episodeRepository = {
      findOneBy: jest.fn().mockResolvedValue(episode),
      save: jest.fn().mockResolvedValue(episode),
    };
    const topicRepository = { findOneBy: jest.fn().mockResolvedValue(topic) };
    const dataSource = {
      getRepository: jest.fn(entity => entity === PodcastEpisodeEntity
        ? episodeRepository
        : topicRepository),
    };
    const module = await Test.createTestingModule({ providers: [
      PodcastTranscriptGenerationService,
      { provide: DataSource, useValue: dataSource },
      { provide: OpenRouterAdapter, useValue: {} },
      { provide: PodcastTranscriptImportService, useValue: {} },
      { provide: PodcastTranscriptManifestService, useValue: { create: jest.fn().mockResolvedValue(manifest) } },
    ] }).compile();
    const service = module.get(PodcastTranscriptGenerationService);

    const result = await service.prompt('episode', ['die Vermieterin, -nen', 'bald']);

    expect(episodeRepository.save).toHaveBeenCalledWith(episode);
    expect(episode.generationInput).toEqual({
      vocabulary: ['die Vermieterin, -nen', 'bald'],
      transcriptManifest: manifest,
    });
    expect(result.manifestId).toBe(manifest.id);
    expect(result.prompt).toContain('Required vocabulary (2 supplied; use every item');
    expect(result.prompt).toContain('"key":"vermieterin"');
    expect(result.prompt).toContain('"key":"bald"');
    await module.close();
  });

  it('reuses saved generation vocabulary when the UI supplies no replacement list', async () => {
    const manifest = createPodcastTranscriptManifestDraft(['die Vermieterin, -nen', 'bald'], 'de', 'en');
    const episode = Object.assign(new PodcastEpisodeEntity(), {
      id: 'episode', topicId: 'topic',
      generationInput: { vocabulary: ['die Vermieterin, -nen', 'bald'], transcriptManifest: manifest },
    });
    const topic = Object.assign(new PodcastTopicEntity(), {
      id: 'topic', title: 'Meine Wohnung', description: '',
      targetLanguage: 'de', translationLanguage: 'en', level: 'A1',
    });
    const episodeRepository = {
      findOneBy: jest.fn().mockResolvedValue(episode),
      save: jest.fn().mockResolvedValue(episode),
    };
    const dataSource = {
      getRepository: jest.fn(entity => entity === PodcastEpisodeEntity
        ? episodeRepository
        : { findOneBy: jest.fn().mockResolvedValue(topic) }),
    };
    const module = await Test.createTestingModule({ providers: [
      PodcastTranscriptGenerationService,
      { provide: DataSource, useValue: dataSource },
      { provide: OpenRouterAdapter, useValue: {} },
      { provide: PodcastTranscriptImportService, useValue: {} },
      { provide: PodcastTranscriptManifestService, useValue: { create: jest.fn() } },
    ] }).compile();
    const service = module.get(PodcastTranscriptGenerationService);

    const result = await service.prompt('episode', []);

    expect(episodeRepository.save).toHaveBeenCalledWith(episode);
    expect(result.prompt).toContain('Required vocabulary (2 supplied; use every item');
    await module.close();
  });
});
