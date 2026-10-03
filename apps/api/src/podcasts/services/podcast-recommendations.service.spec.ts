import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LearningItemReadService } from '../../learning-items/services/learning-item-read.service';
import { ReviewSessionEntity } from '../../review/review-session.entity';
import { PodcastRecommendationsService } from './podcast-recommendations.service';
import { PodcastEpisodeEntity } from '../entities/podcast-episode.entity';
import { PodcastTopicEntity } from '../entities/podcast-topic.entity';
import { PodcastThumbnailAssetEntity } from '../entities/podcast-thumbnail-asset.entity';
import { PodcastListeningProgressEntity } from '../entities/podcast-listening-progress.entity';

const topic = Object.assign(new PodcastTopicEntity(), {
  id: 'topic', targetLanguage: 'de', translationLanguage: 'en', title: 'Café', titleTranslation: 'Café',
});
const episode = Object.assign(new PodcastEpisodeEntity(), {
  id: 'episode', topicId: 'topic', title: 'Bestellen', titleTranslation: 'Ordering',
  audioUrl: '/episode.mp3', audioDurationMs: 60000, audioVersion: 2, thumbnailAssetId: 'art', level: 'A1', position: 1,
});
const thumbnail = Object.assign(new PodcastThumbnailAssetEntity(), {
  id: 'art', cardUrl: '/card.webp', cardWidth: 640, cardHeight: 360,
  heroUrl: '/hero.webp', heroWidth: 1280, heroHeight: 720,
  accessibilityDescription: 'Café conversation', focalPointX: .5, focalPointY: .5, version: 1,
});

describe('PodcastRecommendationsService scope and listening evidence', () => {
  async function setup(options: { sessionUser?: string; missingSession?: boolean; audioVersion?: number; completed?: boolean; positionMs?: number } = {}) {
    const findTopics = jest.fn(async () => [topic]);
    const query = jest.fn(async () => [{ episodeId: 'episode', lexemeId: 'coffee', text: 'Kaffee', translation: 'coffee', owned: true, mastery: 'learning', reviewed: true }]);
    const progress = options.audioVersion === undefined ? [] : [Object.assign(new PodcastListeningProgressEntity(), {
      userId: 'learner', episodeId: 'episode', audioVersion: options.audioVersion,
      positionMs: options.positionMs ?? 0, qualifyingListenedMs: 0,
      completedAt: options.completed ? new Date() : null,
    })];
    const repositories = new Map<Function, object>([
      [PodcastTopicEntity, { findBy: findTopics }],
      [PodcastEpisodeEntity, { find: async () => [episode] }],
      [PodcastThumbnailAssetEntity, { findBy: async () => [thumbnail] }],
      [PodcastListeningProgressEntity, { findBy: async () => progress }],
      [ReviewSessionEntity, { findOneBy: async () => options.missingSession ? null : { userId: options.sessionUser ?? 'learner' } }],
    ]);
    const module = await Test.createTestingModule({ providers: [
      PodcastRecommendationsService,
      { provide: DataSource, useValue: { query, getRepository: (entity: Function) => {
        const repository = repositories.get(entity);
        if (!repository) throw new Error('Unexpected repository');
        return repository;
      } } },
      { provide: LearningItemReadService, useValue: { loadActiveLearningContext: async () => ({ id: 'context', sourceLanguage: 'en', targetLanguage: 'de' }) } },
    ] }).compile();
    return { service: module.get(PodcastRecommendationsService), findTopics, query };
  }

  it('scopes matching to the active language pair and canonical context', async () => {
    const { service, findTopics, query } = await setup();
    const result = await service.recommend('learner', { placement: 'home' });
    expect(findTopics).toHaveBeenCalledWith({ status: 'published', targetLanguage: 'de', translationLanguage: 'en' });
    expect(query).toHaveBeenCalledWith(expect.any(String), ['learner', 'context', 'en', null, ['episode']]);
    expect(result.recommendations[0]?.matchedWords[0]?.lexemeId).toBe('coffee');
  });
  it('rejects another account’s review session', async () => {
    const { service, findTopics } = await setup({ sessionUser: 'someone-else' });
    await expect(service.recommend('learner', { sessionId: 'session' })).rejects.toBeInstanceOf(NotFoundException);
    expect(findTopics).not.toHaveBeenCalled();
  });
  it('marks unsynced session evidence and uses recent committed reviews', async () => {
    const { service, query } = await setup({ missingSession: true });
    const result = await service.recommend('learner', { sessionId: 'session' });
    expect(result.evidence).toBe('pending_sync');
    expect(result.recommendations[0]?.reason).toBe('recent_words');
    expect(query).toHaveBeenCalledWith(expect.any(String), ['learner', 'context', 'en', null, ['episode']]);
  });
  it.each([{ completed: true }, { positionMs: 15000 }])('keeps current listening history out of new suggestions: %j', async state => {
    const { service } = await setup({ ...state, audioVersion: 2 });
    expect((await service.recommend('learner', {})).recommendations).toEqual([]);
  });
  it('allows a replaced recording after old-version completion', async () => {
    const { service } = await setup({ completed: true, audioVersion: 1 });
    expect((await service.recommend('learner', {})).recommendations).toHaveLength(1);
  });
});
