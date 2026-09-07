import { TestBed } from '@angular/core/testing';
import {
  PODCAST_IMMERSIVE_PLATFORM,
  PodcastImmersiveModeService,
  type PodcastImmersivePlatform,
} from './podcast-immersive-mode.service';

class PodcastImmersivePlatformMock implements PodcastImmersivePlatform {
  readonly isNativePlatform = jest.fn(() => false);
  readonly lockLandscape = jest.fn(async () => undefined);
  readonly lockPortrait = jest.fn(async () => undefined);
  readonly unlockOrientation = jest.fn(async () => undefined);
  readonly hideSystemBars = jest.fn(async () => undefined);
  readonly showSystemBars = jest.fn(async () => undefined);
}

describe('PodcastImmersiveModeService', () => {
  let platform: PodcastImmersivePlatformMock;
  let service: PodcastImmersiveModeService;
  let fullscreenElement: Element | null;
  let exitFullscreen: jest.Mock<Promise<void>, []>;

  beforeEach(() => {
    platform = new PodcastImmersivePlatformMock();
    fullscreenElement = null;
    exitFullscreen = jest.fn(async () => {
      fullscreenElement = null;
    });

    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen,
    });

    TestBed.configureTestingModule({
      providers: [
        PodcastImmersiveModeService,
        { provide: PODCAST_IMMERSIVE_PLATFORM, useValue: platform },
      ],
    });
    service = TestBed.inject(PodcastImmersiveModeService);
  });

  it('enters and exits native immersive mode in order', async () => {
    platform.isNativePlatform.mockReturnValue(true);
    const host = document.createElement('main');

    await service.enter(host);

    expect(platform.hideSystemBars).toHaveBeenCalledTimes(1);
    expect(platform.lockLandscape).toHaveBeenCalledTimes(1);
    expect(service.state()).toBe('immersive');

    await service.exit();

    expect(platform.lockPortrait).toHaveBeenCalledTimes(1);
    expect(platform.showSystemBars).toHaveBeenCalledTimes(1);
    expect(service.state()).toBe('standard');
  });

  it('does not repeat successful native cleanup', async () => {
    platform.isNativePlatform.mockReturnValue(true);
    await service.enter(document.createElement('main'));

    await service.exit();
    await service.exit();

    expect(platform.lockPortrait).toHaveBeenCalledTimes(1);
    expect(platform.showSystemBars).toHaveBeenCalledTimes(1);
  });

  it('restores native system bars when landscape locking fails', async () => {
    platform.isNativePlatform.mockReturnValue(true);
    platform.lockLandscape.mockRejectedValueOnce(new Error('unsupported'));

    await service.enter(document.createElement('main'));

    expect(platform.showSystemBars).toHaveBeenCalledTimes(1);
    expect(service.failureReason()).toBe('orientation');
    expect(service.state()).toBe('unavailable');
  });

  it('keeps native immersive mode usable when hiding system bars fails', async () => {
    platform.isNativePlatform.mockReturnValue(true);
    platform.hideSystemBars.mockRejectedValueOnce(new Error('unavailable'));

    await service.enter(document.createElement('main'));

    expect(platform.lockLandscape).toHaveBeenCalledTimes(1);
    expect(service.state()).toBe('immersive');
  });

  it('enters web fullscreen before requesting landscape', async () => {
    const host = document.createElement('main');
    const requestFullscreen = jest.fn(async () => {
      fullscreenElement = host;
    });
    Object.defineProperty(host, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });

    await service.enter(host);

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(platform.lockLandscape).toHaveBeenCalledTimes(1);
    expect(service.state()).toBe('immersive');
  });

  it('retains web fullscreen when orientation locking is unavailable', async () => {
    const host = document.createElement('main');
    Object.defineProperty(host, 'requestFullscreen', {
      configurable: true,
      value: jest.fn(async () => {
        fullscreenElement = host;
      }),
    });
    platform.lockLandscape.mockRejectedValueOnce(new Error('unsupported'));

    await service.enter(host);

    expect(service.failureReason()).toBe('orientation');
    expect(service.state()).toBe('immersive');
  });

  it('reports fullscreen as unavailable without changing playback UI state', async () => {
    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true,
      value: false,
    });

    await service.enter(document.createElement('main'));

    expect(platform.lockLandscape).not.toHaveBeenCalled();
    expect(service.failureReason()).toBe('fullscreen');
    expect(service.state()).toBe('unavailable');
  });

  it('serializes duplicate entry requests', async () => {
    platform.isNativePlatform.mockReturnValue(true);
    const host = document.createElement('main');

    await Promise.all([service.enter(host), service.enter(host)]);

    expect(platform.lockLandscape).toHaveBeenCalledTimes(1);
    expect(platform.hideSystemBars).toHaveBeenCalledTimes(1);
  });

  it('serializes destruction cleanup behind an in-flight entry', async () => {
    platform.isNativePlatform.mockReturnValue(true);
    let finishOrientationLock = (): void => undefined;
    platform.lockLandscape.mockImplementationOnce(() => new Promise<undefined>(resolve => {
      finishOrientationLock = () => resolve(undefined);
    }));

    const entering = service.enter(document.createElement('main'));
    await Promise.resolve();
    TestBed.resetTestingModule();
    finishOrientationLock();
    await entering;
    await service.exit();

    expect(platform.lockPortrait).toHaveBeenCalledTimes(1);
    expect(platform.showSystemBars).toHaveBeenCalledTimes(1);
  });

  it('reconciles browser-initiated fullscreen exit', async () => {
    const host = document.createElement('main');
    Object.defineProperty(host, 'requestFullscreen', {
      configurable: true,
      value: jest.fn(async () => {
        fullscreenElement = host;
      }),
    });
    await service.enter(host);

    fullscreenElement = null;
    document.dispatchEvent(new Event('fullscreenchange'));
    await service.exit();

    expect(platform.unlockOrientation).toHaveBeenCalledTimes(1);
    expect(service.state()).toBe('standard');
  });

  it('exits web fullscreen idempotently', async () => {
    const host = document.createElement('main');
    Object.defineProperty(host, 'requestFullscreen', {
      configurable: true,
      value: jest.fn(async () => {
        fullscreenElement = host;
      }),
    });
    await service.enter(host);

    await service.exit();
    await service.exit();

    expect(platform.unlockOrientation).toHaveBeenCalledTimes(1);
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(service.state()).toBe('standard');
  });

  it('restores native UI after resuming outside landscape', async () => {
    platform.isNativePlatform.mockReturnValue(true);
    await service.enter(document.createElement('main'));

    document.dispatchEvent(new Event('visibilitychange'));
    await service.exit();

    expect(platform.lockPortrait).toHaveBeenCalledTimes(1);
    expect(platform.showSystemBars).toHaveBeenCalledTimes(1);
    expect(service.state()).toBe('standard');
  });

  it('removes its fullscreen listener when the route-scoped service is destroyed', () => {
    const removeListener = jest.spyOn(document, 'removeEventListener');

    TestBed.resetTestingModule();

    expect(removeListener).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});
