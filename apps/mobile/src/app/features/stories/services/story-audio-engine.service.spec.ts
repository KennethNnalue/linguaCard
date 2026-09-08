import { TestBed } from '@angular/core/testing';
import { ScreenAwakeService } from '../../../shared/audio/screen-awake.service';
import { StoryAudioEngine, type AudioTrack } from './story-audio-engine.service';

const track: AudioTrack = {
  url: '/story.mp3',
  timestamps: [],
  sentencePlan: { kind: 'absolute', ranges: [] },
  durationMs: 60_000,
};

describe('StoryAudioEngine screen awake behavior', () => {
  let engine: StoryAudioEngine;
  let audio: HTMLAudioElement;
  let screenAwake: {
    playbackStarted: jest.Mock<Promise<void>, []>;
    playbackStopped: jest.Mock<Promise<void>, []>;
  };
  let audioConstructor: jest.SpyInstance<HTMLAudioElement, [src?: string]>;

  beforeEach(() => {
    screenAwake = {
      playbackStarted: jest.fn(async () => undefined),
      playbackStopped: jest.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        StoryAudioEngine,
        { provide: ScreenAwakeService, useValue: screenAwake },
      ],
    });
    engine = TestBed.inject(StoryAudioEngine);
    audio = document.createElement('audio');
    jest.spyOn(audio, 'play').mockResolvedValue(undefined);
    jest.spyOn(audio, 'pause').mockImplementation(() => undefined);
    audioConstructor = jest.spyOn(globalThis, 'Audio').mockImplementation(src => {
      audio.src = src ?? '';
      return audio;
    });
  });

  afterEach(() => audioConstructor.mockRestore());

  it('keeps the screen awake while a story is playing and releases it on teardown', async () => {
    engine.load(track);
    screenAwake.playbackStopped.mockClear();

    await engine.play();

    expect(screenAwake.playbackStarted).toHaveBeenCalledTimes(1);

    engine.teardown();

    expect(screenAwake.playbackStopped).toHaveBeenCalledTimes(1);
  });

  it('releases the wake lock when story playback fails', async () => {
    jest.mocked(audio.play).mockRejectedValueOnce(new Error('Playback failed'));
    engine.load(track);
    screenAwake.playbackStopped.mockClear();

    await expect(engine.play()).rejects.toThrow('Playback failed');

    expect(screenAwake.playbackStopped).toHaveBeenCalledTimes(1);
  });

  it('releases the wake lock when a story ends', async () => {
    engine.load(track);
    await engine.play();
    screenAwake.playbackStopped.mockClear();
    audio.dispatchEvent(new Event('timeupdate'));

    audio.dispatchEvent(new Event('ended'));

    expect(screenAwake.playbackStopped).toHaveBeenCalledTimes(1);
  });
});
