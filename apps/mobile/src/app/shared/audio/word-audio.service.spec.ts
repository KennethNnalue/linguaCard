import { TestBed } from '@angular/core/testing';
import { AiAudioCacheService } from '../../features/ai/audio/ai-audio-cache.service';
import { AudioReadinessStore } from './audio-readiness.store';
import { WordAudioApiService } from './word-audio-api.service';
import { WordAudioService } from './word-audio.service';
import { audioCacheKey, legacyAudioCacheKey } from './audio-cache-key';

describe('WordAudioService prepared audio', () => {
  const api = {
    batchResolve: jest.fn(),
    download: jest.fn(),
    resolve: jest.fn(),
  };
  const cache = {
    getFromCache: jest.fn(),
    saveBuffer: jest.fn(),
  };

  beforeEach(() => {
    api.batchResolve.mockReset();
    api.download.mockReset();
    api.resolve.mockReset();
    cache.getFromCache.mockReset();
    cache.saveBuffer.mockReset();
    TestBed.configureTestingModule({
      providers: [
        WordAudioService,
        AudioReadinessStore,
        { provide: WordAudioApiService, useValue: api },
        { provide: AiAudioCacheService, useValue: cache },
      ],
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('persists every pre-warmed phrase and serves it without resolving on demand', async () => {
    cache.getFromCache.mockResolvedValue(null);
    api.download
      .mockResolvedValueOnce(new ArrayBuffer(3))
      .mockResolvedValueOnce(new ArrayBuffer(4));
    cache.saveBuffer
      .mockResolvedValueOnce('blob:word')
      .mockResolvedValueOnce('blob:example');
    api.batchResolve.mockResolvedValue({
      results: [
        {
          wordAudio: {
            id: 'word-audio-1',
            normalizedText: 'die rechnung',
            language: 'de-DE',
            audioUrl: 'https://audio.example/word.mp3',
          },
        },
        {
          wordAudio: {
            id: 'word-audio-2',
            normalizedText: 'die rechnung bitte',
            language: 'de-DE',
            audioUrl: 'https://audio.example/example.mp3',
          },
        },
      ],
    });
    const service = TestBed.inject(WordAudioService);

    const result = await service.preWarm([
      { text: 'die Rechnung', language: 'de-DE' },
      { text: 'Die Rechnung, bitte.', language: 'de-DE' },
    ]);

    expect(result).toEqual({ requestedCount: 2, availableCount: 2, savedOfflineCount: 2, failedRequests: [] });
    expect(api.download).toHaveBeenCalledTimes(2);
    await expect(service.resolvePreparedUrl('die Rechnung', 'de-DE')).resolves.toBe('blob:word');
    await expect(service.resolvePreparedUrl('Die Rechnung, bitte.', 'de-DE')).resolves.toBe('blob:example');
    expect(api.resolve).not.toHaveBeenCalled();

    expect(cache.getFromCache).toHaveBeenCalledTimes(4);
    await expect(service.preWarm([
      { text: 'die Rechnung', language: 'de-DE' },
      { text: 'Die Rechnung, bitte.', language: 'de-DE' },
    ])).resolves.toEqual({requestedCount: 2, availableCount: 2, savedOfflineCount: 2, failedRequests: []});
    expect(cache.getFromCache).toHaveBeenCalledTimes(4);
    expect(api.batchResolve).toHaveBeenCalledTimes(1);
  });

  it('does not call the API when prepared audio is missing', async () => {
    cache.getFromCache.mockResolvedValue(null);
    const service = TestBed.inject(WordAudioService);

    await expect(service.resolvePreparedUrl('nicht vorbereitet', 'de-DE')).resolves.toBeNull();

    expect(api.resolve).not.toHaveBeenCalled();
    expect(api.batchResolve).not.toHaveBeenCalled();
  });

  it('reuses audio saved under the legacy cache key without downloading it again', async () => {
    cache.getFromCache
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('blob:legacy-audio');
    const service = TestBed.inject(WordAudioService);

    await expect(service.resolvePreparedUrl('die Rechnung', 'de-DE')).resolves.toBe('blob:legacy-audio');

    expect(cache.getFromCache).toHaveBeenNthCalledWith(1, audioCacheKey('die Rechnung', 'de-DE'));
    expect(cache.getFromCache).toHaveBeenNthCalledWith(2, legacyAudioCacheKey('die Rechnung', 'de-DE'));
    expect(api.resolve).not.toHaveBeenCalled();
  });

  it('starts offline from existing files without requesting missing audio', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    cache.getFromCache.mockResolvedValue(null);
    const service = TestBed.inject(WordAudioService);

    await expect(service.preWarm([{ text: 'nicht gespeichert', language: 'de-DE' }]))
      .resolves.toEqual({
        requestedCount: 1,
        availableCount: 0,
        savedOfflineCount: 0,
        failedRequests: [{text: 'nicht gespeichert', language: 'de-DE'}],
      });

    expect(api.batchResolve).not.toHaveBeenCalled();
  });
});
