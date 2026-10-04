import { PodcastOnboardingExampleRepository } from '../repositories/podcast-onboarding-example.repository';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { LearningItemReadService } from '../../learning-items/services/learning-item-read.service';
import { PodcastOnboardingExampleService } from './podcast-onboarding-example.service';
describe('published onboarding evidence', () => {
  it('requires active-pair, published, timed canonical shared words and rejects partial forms', async () => {
    const query = jest.fn(async () => [
      { collectionId: 'set', episodeId: 'episode', episodeTitle: 'Work', episodeTitleTranslation: 'Work',
        audioUrl: '/conversation.mp3', audioVersion: 2, lexemeId: 'place', word: 'Platz', translation: 'place',
        transcriptText: 'Mein Arbeitsplatz.', transcriptTranslation: 'My workplace.', startMs: 0, endMs: 3000 },
      { collectionId: 'set', episodeId: 'episode', episodeTitle: 'Work', episodeTitleTranslation: 'Work',
        audioUrl: '/conversation.mp3', audioVersion: 2, lexemeId: 'place', word: 'Platz', translation: 'place',
        transcriptText: 'Der Platz ist frei.', transcriptTranslation: 'The seat is free.', startMs: 3000, endMs: 6000 },
    ]);
    const module = await Test.createTestingModule({ providers: [PodcastOnboardingExampleService, PodcastOnboardingExampleRepository,
      { provide: DataSource, useValue: { query } },
      { provide: LearningItemReadService, useValue: { loadActiveLearningContext: async () => ({ targetLanguage: 'de', sourceLanguage: 'en' }) } },
    ] }).compile();
    expect(await module.get(PodcastOnboardingExampleService).forCollection('user', 'set'))
      .toEqual(expect.objectContaining({ word: 'Platz', transcriptText: 'Der Platz ist frei.', startMs: 3000 }));
    expect(query).toHaveBeenCalledWith(expect.stringContaining('collection."isPublished"'), ['set', 'de', 'en']);
    query.mockResolvedValue([]);
    expect(await module.get(PodcastOnboardingExampleService).forCollection('user', 'uncovered')).toBeNull();
  });
});
