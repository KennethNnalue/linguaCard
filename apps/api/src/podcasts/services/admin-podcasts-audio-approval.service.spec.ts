import { ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { StorageService } from '../../storage/storage.service';
import { PodcastEpisodeEntity } from '../entities/podcast-episode.entity';
import { PodcastThumbnailAssetEntity } from '../entities/podcast-thumbnail-asset.entity';
import { PodcastTopicEntity } from '../entities/podcast-topic.entity';
import { AdminPodcastsService } from './admin-podcasts.service';
import { PodcastThumbnailService } from './podcast-thumbnail.service';

describe('Admin podcast audio approval', () => {
  it('refuses publication while a newer audio attempt is running', async () => {
    const episode = Object.assign(new PodcastEpisodeEntity(), {
      id: 'episode', titleTranslation: 'Greeting', thumbnailAssetId: 'thumbnail',
      audioUrl: 'https://audio.example/old.mp3', audioVersion: 2,
      approvedAudioVersion: 2, status: 'ready_for_review' as const,
      audioGenerationStatus: 'generating' as const,
    });
    const manager = {
      findOne: jest.fn().mockResolvedValue(episode),
      save: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn((callback: (value: typeof manager) => Promise<unknown>) => callback(manager)),
    };
    const module = await Test.createTestingModule({ providers: [
      AdminPodcastsService,
      { provide: getRepositoryToken(PodcastTopicEntity), useValue: {} },
      { provide: getRepositoryToken(PodcastEpisodeEntity), useValue: {} },
      { provide: getRepositoryToken(PodcastThumbnailAssetEntity), useValue: {} },
      { provide: DataSource, useValue: dataSource },
      { provide: PodcastThumbnailService, useValue: {} },
      { provide: StorageService, useValue: {} },
    ] }).compile();
    const service = module.get(AdminPodcastsService);

    await expect(service.publishEpisode('episode')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.approveAudio('episode', 2)).rejects.toBeInstanceOf(ConflictException);
    expect(manager.save).not.toHaveBeenCalled();
  });
});
