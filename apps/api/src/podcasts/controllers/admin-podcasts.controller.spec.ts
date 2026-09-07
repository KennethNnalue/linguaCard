import { Test } from '@nestjs/testing';
import type { AdminPublishPodcastVocabularyResult } from '@lingua-card/shared/domain';
import { AdminPodcastEpisodesController } from './admin-podcasts.controller';
import { AdminPodcastsService } from '../services/admin-podcasts.service';
import { PodcastAudioGenerationService } from '../services/podcast-audio-generation.service';
import { PodcastEpisodeCreationService } from '../services/podcast-episode-creation.service';
import { ElevenLabsPodcastGenerationService } from '../services/elevenlabs-podcast-generation.service';
import { PodcastPlatformCollectionService } from '../services/podcast-platform-collection.service';
import { PodcastTranscriptGenerationService } from '../services/podcast-transcript-generation.service';
import { PodcastTranscriptImportService } from '../services/podcast-transcript-import.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';

describe('AdminPodcastEpisodesController', () => {
  const platformCollections = { publish: jest.fn() };
  let controller: AdminPodcastEpisodesController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      controllers: [AdminPodcastEpisodesController],
      providers: [
        { provide: AdminPodcastsService, useValue: {} },
        { provide: PodcastTranscriptImportService, useValue: {} },
        { provide: PodcastAudioGenerationService, useValue: {} },
        { provide: PodcastTranscriptGenerationService, useValue: {} },
        { provide: ElevenLabsPodcastGenerationService, useValue: {} },
        { provide: PodcastEpisodeCreationService, useValue: {} },
        { provide: PodcastPlatformCollectionService, useValue: platformCollections },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(AdminPodcastEpisodesController);
  });

  it('delegates vocabulary publication and returns its result contract', async () => {
    const result: AdminPublishPodcastVocabularyResult = {
      collection: {
        id: 'collection-1', title: 'Podcast · Ordering coffee', emoji: '🎙️',
        coverImageUrl: null, level: 'A1', topic: 'At the café', sourceLanguage: 'en',
        targetLanguage: 'de', status: 'published', wordCount: 3, dictionaryLinked: 3,
        isPublished: true, storyCategory: null, createdAt: '', updatedAt: '',
      },
      created: true,
      essentialCount: 3,
      dictionaryReused: 2,
      dictionaryCreated: 1,
      audioReused: 3,
      audioGenerated: 0,
    };
    platformCollections.publish.mockResolvedValue(result);

    await expect(controller.publishVocabularyCollection('episode-1')).resolves.toEqual(result);
    expect(platformCollections.publish).toHaveBeenCalledWith('episode-1');
  });
});
