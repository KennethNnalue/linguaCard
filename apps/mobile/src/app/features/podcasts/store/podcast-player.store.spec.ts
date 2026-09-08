import { TestBed } from '@angular/core/testing';
import type { PodcastEpisodePlayer } from '@lingua-card/shared/domain';
import { NEVER, of } from 'rxjs';
import { AiAudioCacheService } from '../../ai/audio/ai-audio-cache.service';
import { AuthService } from '../../../core/services/auth.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { EngagementStore } from '../../engagement/state/engagement.store';
import { PodcastApiService } from '../data-access/podcast-api.service';
import { PodcastPlayerStore } from './podcast-player.store';

const episode: PodcastEpisodePlayer = {
  id: 'episode-1', topicId: 'topic-1', topicTitle: 'Topic', title: 'First episode',
  audioUrl: '/episode-1.mp3', audioDurationMs: 60_000, audioVersion: 1,
  thumbnail: {
    assetId: 'thumbnail-1', cardUrl: '/card.webp', cardWidth: 640, cardHeight: 360,
    heroUrl: '/hero.webp', heroWidth: 1280, heroHeight: 720,
    accessibilityDescription: 'Scene', focalPoint: { x: .5, y: .5 }, version: 1,
  },
  speakers: [], turns: [], progress: null,
  playbackContext: {
    firstEpisodeId: 'episode-1', previousEpisodeId: null,
    nextEpisodeId: 'episode-2', nextTopic: null,
  },
};

describe('PodcastPlayerStore episode transitions', () => {
  it('keeps the current episode mounted while the next episode loads', async () => {
    const getPlayer = jest.fn()
      .mockReturnValueOnce(of(episode))
      .mockReturnValueOnce(NEVER);
    TestBed.configureTestingModule({
      providers: [
        PodcastPlayerStore,
        { provide: PodcastApiService, useValue: { getPlayer } },
        { provide: AuthService, useValue: { currentUser: jest.fn(() => null) } },
        { provide: LocalDataService, useValue: {} },
        {
          provide: AiAudioCacheService,
          useValue: { getOrDownload: jest.fn(async () => '/cached-episode-1.mp3') },
        },
        { provide: EngagementStore, useValue: {} },
      ],
    });
    const store = TestBed.inject(PodcastPlayerStore);

    store.loadEpisode('episode-1');
    await waitFor(() => store.status() === 'success');
    store.loadEpisode('episode-2');

    expect(store.status()).toBe('loading');
    expect(store.episode()?.id).toBe('episode-1');
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error('Expected asynchronous store transition did not complete');
}
