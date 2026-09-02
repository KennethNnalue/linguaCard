import {WordAudioService} from './word-audio.service';
import {WordAudioEntity} from './word-audio.entity';

function readyEntity(): WordAudioEntity {
  const entity = new WordAudioEntity();
  entity.id = 'audio-1';
  entity.normalizedText = 'der hund';
  entity.displayText = 'der Hund';
  entity.language = 'de-DE';
  entity.audioUrl = 'https://old.example/word-audio/hash.mp3';
  entity.storagePath = 'word-audio/hash.mp3';
  entity.durationMs = 500;
  entity.status = 'ready';
  entity.failedAt = null;
  entity.createdAt = new Date('2026-01-01T00:00:00Z');
  entity.updatedAt = new Date('2026-01-01T00:00:00Z');
  return entity;
}

describe('WordAudioService storage verification', () => {
  it('reuses a ready row only when its object exists in configured storage', async () => {
    const entity = readyEntity();
    const repo = {
      findByNormalizedText: jest.fn().mockResolvedValue(entity),
      save: jest.fn().mockImplementation(value => Promise.resolve(value)),
    };
    const storage = {
      getUrlIfExists: jest.fn().mockResolvedValue('https://dev-r2.example/word-audio/hash.mp3'),
    };
    const projection = {project: jest.fn().mockResolvedValue(undefined)};
    const service = new WordAudioService(
      repo as never,
      {} as never,
      {} as never,
      storage as never,
      projection as never,
    );

    const result = await service.resolve('der Hund');

    expect(result.cached).toBe(true);
    expect(result.wordAudio.audioUrl).toBe('https://dev-r2.example/word-audio/hash.mp3');
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
      audioUrl: 'https://dev-r2.example/word-audio/hash.mp3',
      status: 'ready',
    }));
  });

  it('regenerates a ready row when its object is missing from configured storage', async () => {
    const entity = readyEntity();
    const repo = {
      findByNormalizedText: jest.fn().mockResolvedValue(entity),
      save: jest.fn().mockImplementation(value => Promise.resolve(value)),
    };
    const storage = {
      getUrlIfExists: jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null),
      upload: jest.fn().mockResolvedValue('https://dev-r2.example/word-audio/hash.mp3'),
    };
    const tts = {
      generateSpeech: jest.fn().mockResolvedValue({
        audioBuffer: new Uint8Array([1, 2, 3]).buffer,
        durationMs: 500,
      }),
    };
    const projection = {project: jest.fn().mockResolvedValue(undefined)};
    const service = new WordAudioService(
      repo as never,
      tts as never,
      {} as never,
      storage as never,
      projection as never,
    );

    const result = await service.resolve('der Hund');

    expect(result.cached).toBe(false);
    expect(tts.generateSpeech).toHaveBeenCalledTimes(1);
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(result.wordAudio).toEqual(expect.objectContaining({
      audioUrl: 'https://dev-r2.example/word-audio/hash.mp3',
      status: 'ready',
    }));
  });
});
