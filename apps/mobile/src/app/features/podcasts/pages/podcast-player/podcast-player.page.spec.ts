import { computed, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, type ParamMap } from '@angular/router';
import type { PodcastEpisodePlayer, PodcastPlayerTurn } from '@lingua-card/shared/domain';
import { BehaviorSubject } from 'rxjs';
import {
  type PodcastPlayerError, PodcastPlayerStore,
} from '../../store/podcast-player.store';
import {
  PodcastImmersiveModeService,
  type PodcastImmersiveFailureReason,
  type PodcastImmersiveModeState,
} from '../../services/podcast-immersive-mode.service';
import { PodcastScreenAwakeService } from '../../services/podcast-screen-awake.service';
import {
  PODCAST_CHROME_AUTO_HIDE_MS,
  PodcastPlayerPage,
  nextPodcastPlaybackSpeed,
  podcastPlayerErrorMessageKey,
} from './podcast-player.page';

const currentTurn: PodcastPlayerTurn = {
  id: 'turn-1', speakerId: 'speaker-1', position: 1,
  targetText: 'Das ist schön.', translation: 'That is nice.',
  startMs: 0, endMs: 10_000, wordTimings: [],
};

const episode: PodcastEpisodePlayer = {
  id: 'episode-1', topicId: 'topic-1', topicTitle: 'Meine Wohnung', title: 'Meine neue Wohnung',
  audioUrl: '/episode.mp3', audioDurationMs: 60_000, audioVersion: 1,
  thumbnail: {
    assetId: 'thumbnail-1', cardUrl: '/card.webp', cardWidth: 640, cardHeight: 360,
    heroUrl: '/hero.webp', heroWidth: 1280, heroHeight: 720,
    accessibilityDescription: 'Two people talking in an apartment',
    focalPoint: { x: .5, y: .5 }, version: 1,
  },
  speakers: [{ id: 'speaker-1', key: 'speaker', name: 'Lukas' }],
  turns: [currentTurn], progress: null,
  playbackContext: {
    firstEpisodeId: 'episode-1', previousEpisodeId: null, nextEpisodeId: null, nextTopic: null,
  },
};

class PodcastPlayerStoreMock {
  readonly episode = signal<PodcastEpisodePlayer | null>(episode);
  readonly currentTurn = signal<PodcastPlayerTurn | null>(currentTurn);
  readonly activeWordIndex = signal(-1);
  readonly showTranslation = signal(true);
  readonly translationMode = signal<'target' | 'both' | 'reveal'>('both');
  readonly currentTimeMs = signal(4_000);
  readonly isPlaying = signal(false);
  readonly speed = signal(1);
  readonly repeatMode = signal<'off' | 'episode' | 'topic'>('off');
  readonly progressError = signal<PodcastPlayerError | null>(null);
  readonly status = signal<'idle' | 'loading' | 'success' | 'error'>('success');
  readonly error = signal<PodcastPlayerError | null>(null);
  readonly playbackQueue = signal<string[]>([]);
  readonly playbackScopeChanged = jest.fn();
  readonly playbackQueueChanged = jest.fn();
  readonly repeatModeChanged = jest.fn();
  readonly loadEpisode = jest.fn();
  readonly playbackStateChanged = jest.fn((playing: boolean) => this.isPlaying.set(playing));
  readonly persistProgress = jest.fn();
  readonly completeCurrentEpisode = jest.fn(async () => 0);
  readonly nextPlaybackTarget = jest.fn(() => null);
  readonly translationModeChanged = jest.fn();
  readonly speedChanged = jest.fn((speed: number) => this.speed.set(speed));
  readonly revealTranslation = jest.fn();
}

class PodcastImmersiveModeServiceMock {
  readonly state = signal<PodcastImmersiveModeState>('standard');
  readonly isLandscape = signal(false);
  readonly failureReason = signal<PodcastImmersiveFailureReason | null>(null);
  readonly isImmersive = computed(() => this.state() === 'immersive');
  readonly isTransitioning = computed(() => this.state() === 'entering' || this.state() === 'exiting');
  readonly enter = jest.fn(async () => {
    this.state.set('immersive');
    this.isLandscape.set(true);
  });
  readonly exit = jest.fn(async () => {
    this.state.set('standard');
    this.isLandscape.set(false);
  });
  readonly restorePortrait = jest.fn(async () => {
    this.state.set('standard');
    this.isLandscape.set(false);
  });
}

class PodcastScreenAwakeServiceMock {
  readonly isSleepAllowed = signal(false);
  readonly isKeepingScreenAwake = computed(() => !this.isSleepAllowed());
  readonly playbackStarted = jest.fn(async () => undefined);
  readonly playbackStopped = jest.fn(async () => undefined);
  readonly toggleSleepAllowed = jest.fn(async () => {
    this.isSleepAllowed.update(isAllowed => !isAllowed);
  });
}

describe('podcast playback speed', () => {
  it('cycles through the supported speeds', () => {
    expect(nextPodcastPlaybackSpeed(0.75)).toBe(1);
    expect(nextPodcastPlaybackSpeed(1)).toBe(1.25);
    expect(nextPodcastPlaybackSpeed(1.25)).toBe(1.5);
    expect(nextPodcastPlaybackSpeed(1.5)).toBe(0.75);
  });

  it('returns the first speed when the current value is unsupported', () => {
    expect(nextPodcastPlaybackSpeed(2)).toBe(0.75);
  });
});

describe('podcast player error presentation', () => {
  it.each([
    ['load-episode', 'podcasts.player.errors.loadEpisode'],
    ['save-progress', 'podcasts.player.errors.saveProgress'],
    ['completion-threshold', 'podcasts.player.errors.completionThreshold'],
  ] as const)('maps %s to its translation key', (error, messageKey) => {
    expect(podcastPlayerErrorMessageKey(error)).toBe(messageKey);
  });
});

describe('PodcastPlayerPage immersive presentation', () => {
  let fixture: ComponentFixture<PodcastPlayerPage>;
  let page: PodcastPlayerPage;
  let store: PodcastPlayerStoreMock;
  let immersiveMode: PodcastImmersiveModeServiceMock;
  let screenAwake: PodcastScreenAwakeServiceMock;
  let episodeParams: BehaviorSubject<ParamMap>;
  let playbackQueryParams: BehaviorSubject<ParamMap>;

  beforeEach(async () => {
    store = new PodcastPlayerStoreMock();
    immersiveMode = new PodcastImmersiveModeServiceMock();
    screenAwake = new PodcastScreenAwakeServiceMock();
    episodeParams = new BehaviorSubject(convertToParamMap({ episodeId: 'episode-1' }));
    playbackQueryParams = new BehaviorSubject(convertToParamMap({}));
    TestBed.overrideComponent(PodcastPlayerPage, {
      set: {
        providers: [
          { provide: PodcastPlayerStore, useValue: store },
          { provide: PodcastImmersiveModeService, useValue: immersiveMode },
          { provide: PodcastScreenAwakeService, useValue: screenAwake },
          {
            provide: ActivatedRoute,
            useValue: {
              paramMap: episodeParams,
              queryParamMap: playbackQueryParams,
            },
          },
        ],
      },
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(PodcastPlayerPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => jest.useRealTimers());

  it('opens immersive mode without replacing the audio element', async () => {
    const audioBefore = playerRoot().querySelector('audio');
    const expandButton = playerRoot().querySelector('.top-chrome ion-button:last-of-type');
    expect(expandButton).not.toBeNull();
    expect(expandButton?.querySelector('ion-icon[name="expand-outline"]')).not.toBeNull();

    expandButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(immersiveMode.enter).toHaveBeenCalledTimes(1);
    expect(page.chromeVisible()).toBe(false);
    expect(playerRoot().querySelector('audio')).toBe(audioBefore);
    expect(playerRoot().querySelectorAll('audio')).toHaveLength(1);
    expect(playerRoot().classList.contains('player--immersive')).toBe(true);
    expect(playerRoot().classList.contains('player--chrome-visible')).toBe(false);
    expect(playerRoot().querySelector('.top-chrome')?.getAttribute('aria-hidden')).toBe('true');
    expect(playerRoot().querySelector('.top-chrome')?.hasAttribute('inert')).toBe(true);
    expect(playerRoot().querySelector('.controls')?.getAttribute('aria-hidden')).toBe('true');
    expect(playerRoot().querySelector('.controls')?.hasAttribute('inert')).toBe(true);
    expect(playerRoot().querySelector('.dialogue')).not.toBeNull();
    expect(playerRoot().textContent).toContain(currentTurn.translation);
  });

  it('reveals chrome on a surface tap and keeps it visible on chrome interaction', async () => {
    await page.enterImmersiveMode();
    fixture.detectChanges();

    playerRoot().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(page.chromeVisible()).toBe(true);

    const speedButton = playerRoot().querySelector('.speed');
    speedButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(store.speedChanged).toHaveBeenCalledWith(1.25);
    expect(page.chromeVisible()).toBe(true);
  });

  it('keeps visible portrait controls accessible when orientation lock fails', async () => {
    immersiveMode.enter.mockImplementationOnce(async () => {
      immersiveMode.state.set('immersive');
      immersiveMode.failureReason.set('orientation');
    });

    await page.enterImmersiveMode();
    fixture.detectChanges();

    expect(page.chromeVisible()).toBe(false);
    expect(page.isChromeVisible()).toBe(true);
    expect(playerRoot().classList.contains('player--chrome-visible')).toBe(true);
    expect(playerRoot().querySelector('.top-chrome')?.hasAttribute('aria-hidden')).toBe(false);
    expect(playerRoot().querySelector('.top-chrome')?.hasAttribute('inert')).toBe(false);
    expect(playerRoot().querySelector('.controls')?.hasAttribute('aria-hidden')).toBe(false);
    expect(playerRoot().querySelector('.controls')?.hasAttribute('inert')).toBe(false);
  });

  it('auto-hides visible chrome after three seconds only while playing', async () => {
    jest.useFakeTimers();
    await page.enterImmersiveMode();
    page.chromeVisible.set(true);

    page.started();
    jest.advanceTimersByTime(PODCAST_CHROME_AUTO_HIDE_MS);
    expect(page.chromeVisible()).toBe(false);

    page.paused(new Event('pause'));
    jest.advanceTimersByTime(PODCAST_CHROME_AUTO_HIDE_MS);
    expect(page.chromeVisible()).toBe(true);
  });

  it('does not auto-hide chrome while focus remains in the controls', async () => {
    jest.useFakeTimers();
    await page.enterImmersiveMode();
    page.chromeVisible.set(true);

    page.started();
    page.chromeFocused();
    jest.advanceTimersByTime(PODCAST_CHROME_AUTO_HIDE_MS);

    expect(page.chromeVisible()).toBe(true);
  });

  it('reveals chrome and cancels auto-hide when audio playback fails', async () => {
    jest.useFakeTimers();
    await page.enterImmersiveMode();
    page.chromeVisible.set(true);
    page.started();
    page.chromeVisible.set(false);

    const audio = playerRoot().querySelector('audio');
    audio?.dispatchEvent(new Event('error'));
    jest.advanceTimersByTime(PODCAST_CHROME_AUTO_HIDE_MS);

    expect(store.playbackStateChanged).toHaveBeenLastCalledWith(false);
    expect(store.isPlaying()).toBe(false);
    expect(page.chromeVisible()).toBe(true);
    expect(screenAwake.playbackStopped).toHaveBeenCalledTimes(1);
  });

  it('keeps the screen awake while playing and lets the listener allow sleep', async () => {
    page.started();

    expect(screenAwake.playbackStarted).toHaveBeenCalledTimes(1);

    const sleepButton = playerRoot().querySelector('ion-icon[name="sunny-outline"]')
      ?.closest('ion-button');
    sleepButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(screenAwake.toggleSleepAllowed).toHaveBeenCalledTimes(1);
    expect(screenAwake.isSleepAllowed()).toBe(true);
  });

  it('distinguishes episode repeat from topic repeat', () => {
    store.repeatMode.set('episode');
    fixture.detectChanges();
    expect(playerRoot().querySelector('.repeat-mode-badge')?.textContent?.trim()).toBe('1');

    store.repeatMode.set('topic');
    fixture.detectChanges();
    expect(playerRoot().querySelector('.repeat-mode-badge')?.textContent?.trim()).toBe('∞');
  });

  it('turns off either active repeat mode before enabling episode repeat again', () => {
    store.repeatMode.set('topic');
    page.toggleRepeat();
    expect(store.repeatModeChanged).toHaveBeenLastCalledWith('off');

    store.repeatMode.set('off');
    page.toggleRepeat();
    expect(store.repeatModeChanged).toHaveBeenLastCalledWith('episode');
  });

  it('supports manual landscape rotation without immersive entry', () => {
    immersiveMode.isLandscape.set(true);
    store.isPlaying.set(true);
    fixture.detectChanges();

    playerRoot().dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(page.chromeVisible()).toBe(false);
    expect(playerRoot().classList.contains('player--landscape')).toBe(true);
  });

  it('loads the next episode when Angular reuses the player route', () => {
    store.loadEpisode.mockClear();

    playbackQueryParams.next(convertToParamMap({
      scope: 'topic', autoplay: '1', repeat: 'topic', queue: 'episode-1,episode-2',
    }));
    episodeParams.next(convertToParamMap({ episodeId: 'episode-2' }));

    expect(store.playbackScopeChanged).toHaveBeenLastCalledWith(true);
    expect(store.playbackQueueChanged).toHaveBeenLastCalledWith(['episode-1', 'episode-2']);
    expect(store.repeatModeChanged).toHaveBeenLastCalledWith('topic');
    expect(store.loadEpisode).toHaveBeenLastCalledWith('episode-2');
  });

  it('returns to portrait without replacing the audio element', async () => {
    await page.enterImmersiveMode();
    const audioBefore = playerRoot().querySelector('audio');
    page.chromeVisible.set(true);
    fixture.detectChanges();

    const contractButton = playerRoot().querySelector('ion-icon[name="contract-outline"]')
      ?.closest('ion-button');
    expect(contractButton).not.toBeNull();
    contractButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(immersiveMode.exit).toHaveBeenCalledTimes(1);
    expect(page.chromeVisible()).toBe(true);
    expect(playerRoot().querySelector('audio')).toBe(audioBefore);
  });

  it('clears interactions that race with immersive exit', async () => {
    jest.useFakeTimers();
    await page.enterImmersiveMode();
    store.isPlaying.set(true);
    page.chromeVisible.set(true);
    let finishExit = (): void => undefined;
    immersiveMode.exit.mockImplementationOnce(() => new Promise<void>(resolve => {
      finishExit = () => {
        immersiveMode.state.set('standard');
        immersiveMode.isLandscape.set(false);
        resolve();
      };
    }));

    const exiting = page.exitImmersiveMode();
    page.chromeInteracted(new Event('click'));
    finishExit();
    await exiting;
    jest.advanceTimersByTime(PODCAST_CHROME_AUTO_HIDE_MS);

    expect(page.chromeVisible()).toBe(true);
  });

  function playerRoot(): HTMLElement {
    const player = fixture.nativeElement.querySelector('.player');
    if (!(player instanceof HTMLElement)) throw new Error('Expected podcast player host');
    return player;
  }
});
