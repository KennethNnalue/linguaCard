import { Test } from '@nestjs/testing';
import type { AdminPodcastEpisodeListItem } from '@lingua-card/shared/domain';
import { AdminPodcastsService } from './admin-podcasts.service';
import { PodcastEpisodeCreationService } from './podcast-episode-creation.service';
import { PodcastTranscriptGenerationService } from './podcast-transcript-generation.service';
import { PodcastTranscriptImportService } from './podcast-transcript-import.service';

function createEpisode(status: AdminPodcastEpisodeListItem['status'] = 'queued'): AdminPodcastEpisodeListItem {
  return {
    id: 'episode-1', topicId: 'topic-1', externalId: 'topic-episode-1', title: 'Episode 1',
    titleTranslation: '', description: '', level: 'A1', position: 0, audioDurationMs: 0,
    audioUrl: null, audioVersion: 0, generationError: null, generationRequestId: 'request-1',
    elevenLabsProjectId: null, hasTranscript: false, estimatedDurationMs: 0, status,
    thumbnail: null, createdAt: '2026-09-04T00:00:00.000Z', updatedAt: '2026-09-04T00:00:00.000Z',
  };
}

describe('PodcastEpisodeCreationService', () => {
  const podcasts = {
    reserveEpisode: jest.fn(), findPendingGeneratedEpisodes: jest.fn(),
    markEpisodeGenerationStarted: jest.fn(), findEpisodeEntity: jest.fn(),
    markEpisodeGenerationFailed: jest.fn(), queueFailedEpisode: jest.fn(),
  };
  const transcriptGeneration = { generate: jest.fn() };
  const transcriptImport = { commit: jest.fn() };
  let service: PodcastEpisodeCreationService;

  beforeEach(async () => {
    jest.resetAllMocks();
    podcasts.findPendingGeneratedEpisodes.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        PodcastEpisodeCreationService,
        { provide: AdminPodcastsService, useValue: podcasts },
        { provide: PodcastTranscriptGenerationService, useValue: transcriptGeneration },
        { provide: PodcastTranscriptImportService, useValue: transcriptImport },
      ],
    }).compile();
    service = module.get(PodcastEpisodeCreationService);
  });

  test('returns the same reserved episode and schedules generation once', async () => {
    const episode = createEpisode();
    podcasts.reserveEpisode.mockResolvedValue(episode);
    podcasts.markEpisodeGenerationStarted.mockResolvedValue(false);

    await expect(service.create('topic-1', {
      requestId: 'request-1', vocabulary: [' Kaffee ', 'kaffee'], direction: ' Breakfast ',
    })).resolves.toEqual(episode);
    await Promise.resolve();

    expect(podcasts.reserveEpisode).toHaveBeenCalledWith('topic-1', 'request-1', {
      vocabulary: ['Kaffee'], direction: 'Breakfast',
    });
    expect(podcasts.markEpisodeGenerationStarted).toHaveBeenCalledWith('episode-1');
    expect(transcriptGeneration.generate).not.toHaveBeenCalled();
  });

  test('persists a failure instead of deleting the reserved episode', async () => {
    podcasts.reserveEpisode.mockResolvedValue(createEpisode());
    podcasts.markEpisodeGenerationStarted.mockResolvedValue(true);
    podcasts.findEpisodeEntity.mockResolvedValue({
      generationInput: { vocabulary: ['Kaffee'] },
    });
    transcriptGeneration.generate.mockRejectedValue(new Error('provider unavailable'));

    await service.create('topic-1', { requestId: 'request-1', vocabulary: ['Kaffee'] });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(podcasts.markEpisodeGenerationFailed)
      .toHaveBeenCalledWith('episode-1', 'provider unavailable');
  });

  test('commits a valid generated transcript', async () => {
    podcasts.reserveEpisode.mockResolvedValue(createEpisode());
    podcasts.markEpisodeGenerationStarted.mockResolvedValue(true);
    podcasts.findEpisodeEntity.mockResolvedValue({
      generationInput: { vocabulary: ['Kaffee'], direction: 'Breakfast' },
    });
    const payload = { schemaVersion: 1, speakers: [], turns: [], vocabulary: [] };
    transcriptGeneration.generate.mockResolvedValue({
      payload, preview: { status: 'valid', fingerprint: 'fingerprint', conflicts: [] },
    });

    await service.create('topic-1', { requestId: 'request-1', vocabulary: ['Kaffee'] });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(transcriptImport.commit).toHaveBeenCalledWith('episode-1', {
      fingerprint: 'fingerprint', payload,
    });
    expect(podcasts.markEpisodeGenerationFailed).not.toHaveBeenCalled();
  });

  test('requeues the same failed episode instead of creating a duplicate', async () => {
    podcasts.queueFailedEpisode.mockResolvedValue(createEpisode());
    podcasts.markEpisodeGenerationStarted.mockResolvedValue(false);

    await expect(service.retry('episode-1')).resolves.toEqual(createEpisode());
    await Promise.resolve();

    expect(podcasts.queueFailedEpisode).toHaveBeenCalledWith('episode-1');
    expect(podcasts.reserveEpisode).not.toHaveBeenCalled();
  });
});
