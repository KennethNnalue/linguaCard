import { TestBed } from '@angular/core/testing';
import {
  PODCAST_SCREEN_AWAKE_PLATFORM,
  type PodcastScreenAwakePlatform,
  PodcastScreenAwakeService,
} from './podcast-screen-awake.service';

describe('PodcastScreenAwakeService', () => {
  let service: PodcastScreenAwakeService;
  let platform: jest.Mocked<PodcastScreenAwakePlatform>;

  beforeEach(() => {
    platform = {
      keepAwake: jest.fn(async () => undefined),
      allowSleep: jest.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        PodcastScreenAwakeService,
        { provide: PODCAST_SCREEN_AWAKE_PLATFORM, useValue: platform },
      ],
    });
    service = TestBed.inject(PodcastScreenAwakeService);
  });

  it('keeps the screen awake by default while playback is active', async () => {
    await service.playbackStarted();

    expect(service.isKeepingScreenAwake()).toBe(true);
    expect(platform.keepAwake).toHaveBeenCalledTimes(1);
  });

  it('allows sleep when the listener opts in and restores the wake lock when toggled again', async () => {
    await service.playbackStarted();
    await service.toggleSleepAllowed();

    expect(service.isSleepAllowed()).toBe(true);
    expect(platform.allowSleep).toHaveBeenCalledTimes(1);

    await service.toggleSleepAllowed();

    expect(service.isSleepAllowed()).toBe(false);
    expect(platform.keepAwake).toHaveBeenCalledTimes(2);
  });

  it('releases the wake lock when playback stops', async () => {
    await service.playbackStarted();
    await service.playbackStopped();

    expect(platform.allowSleep).toHaveBeenCalledTimes(1);
  });

  it('keeps the latest preference when platform operations fail', async () => {
    platform.keepAwake.mockRejectedValueOnce(new Error('Unavailable'));

    await expect(service.playbackStarted()).resolves.toBeUndefined();

    expect(service.isKeepingScreenAwake()).toBe(true);
  });
});
