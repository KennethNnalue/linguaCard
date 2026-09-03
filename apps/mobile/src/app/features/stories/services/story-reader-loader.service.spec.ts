import { TestBed } from '@angular/core/testing';
import type { Story } from '@lingua-card/shared/domain';
import { AiAudioCacheService } from '../../ai/audio/ai-audio-cache.service';
import { StoryStore } from '../store/story.store';
import { StoryApiService } from './story-api.service';
import { StoryReaderLoaderService } from './story-reader-loader.service';

const cachedStory: Story = {
  id: 'story-1',
  userId: 'user-1',
  title: 'A day',
  titleTranslation: 'Ein Tag',
  bodyDe: 'Ein Tag.',
  bodyNative: 'A day.',
  nativeLang: 'en',
  sentences: [],
  wordTimestamps: [],
  vocabWords: [],
  audioUrl: null,
  audioDurationMs: 0,
  sourceCollectionIds: [],
  difficultyLevel: 'A1',
  lengthType: 'short',
  listenCount: 0,
  lastListenedAt: null,
  generatedAt: '2026-01-01T00:00:00.000Z',
  generationStatus: 'complete',
};

describe('StoryReaderLoaderService offline loading', () => {
  test('opens cached story text without trying to generate missing narration', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const ensureLoaded = jest.fn().mockResolvedValue(undefined);
    const generateAudio = jest.fn();
    TestBed.configureTestingModule({
      providers: [
        StoryReaderLoaderService,
        {
          provide: StoryStore,
          useValue: {
            ensureLoaded,
            getById: jest.fn(() => cachedStory),
            generateAudio,
          },
        },
        { provide: StoryApiService, useValue: { getById: jest.fn() } },
        { provide: AiAudioCacheService, useValue: { getOrDownload: jest.fn(), getFromCache: jest.fn() } },
      ],
    });

    const result = await TestBed.inject(StoryReaderLoaderService).load('story-1', {
      onAudioGenerating: jest.fn(),
      onAudioLoading: jest.fn(),
    });

    expect(ensureLoaded).toHaveBeenCalled();
    expect(generateAudio).not.toHaveBeenCalled();
    expect(result).toEqual({ story: cachedStory, hasAudio: false, needsEnrichment: false });
  });
});
