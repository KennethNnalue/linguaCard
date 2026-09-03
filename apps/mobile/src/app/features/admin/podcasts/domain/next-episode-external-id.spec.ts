import type { AdminPodcastEpisodeListItem, AdminPodcastTopicListItem } from '@lingua-card/shared/domain';
import { nextEpisodeExternalId } from './next-episode-external-id';

describe('nextEpisodeExternalId', () => {
  test('starts a topic at sequence one', () => {
    expect(nextEpisodeExternalId(createTopic())).toBe('at-the-cafe-01');
  });

  test('advances past existing episode IDs', () => {
    const topic = createTopic();
    topic.episodes = [createEpisode('at-the-cafe-02'), createEpisode('at-the-cafe-03')];

    expect(nextEpisodeExternalId(topic)).toBe('at-the-cafe-04');
  });
});

function createTopic(): AdminPodcastTopicListItem {
  return {
    id: 'topic-1', externalId: 'at-the-cafe', title: 'At the café', description: '',
    targetLanguage: 'de', translationLanguage: 'en', minimumLevel: 'A1', maximumLevel: 'A2',
    status: 'draft', thumbnail: null, episodes: [], createdAt: '', updatedAt: '',
  };
}

function createEpisode(externalId: string): AdminPodcastEpisodeListItem {
  return {
    id: externalId, topicId: 'topic-1', externalId, title: '', titleTranslation: '',
    description: '', level: 'A1', position: 0, audioDurationMs: 0, audioUrl: null,
    audioVersion: 0, generationError: null, hasTranscript: false, estimatedDurationMs: 0,
    status: 'draft', thumbnail: null, createdAt: '', updatedAt: '',
  };
}
