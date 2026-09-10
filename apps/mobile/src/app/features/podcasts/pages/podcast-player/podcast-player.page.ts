import {
  ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, OnInit, signal,
  viewChild,
} from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonButton, IonContent, IonIcon, IonRange, IonSpinner,
} from '@ionic/angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { ViewWillLeave } from '@ionic/angular/lazy';
import { addIcons } from 'ionicons';
import { TranslatePipe } from '@ngx-translate/core';
import {
  arrowBackOutline, arrowRedoOutline, arrowUndoOutline, eyeOffOutline, eyeOutline,
  contractOutline, documentTextOutline, expandOutline, moonOutline, pause, play, repeatOutline,
  speedometerOutline, sunnyOutline,
} from 'ionicons/icons';
import { combineLatest, distinctUntilChanged, map } from 'rxjs';
import {
  type PodcastPlayerError, PodcastPlayerStore,
} from '../../store/podcast-player.store';
import { OfflineImageDirective } from '../../../../shared/image/offline-image.directive';
import { PodcastImmersiveModeService } from '../../services/podcast-immersive-mode.service';
import { ScreenAwakeService } from '../../../../shared/audio/screen-awake.service';
import { PodcastTranscriptComponent } from '../../components/podcast-transcript/podcast-transcript.component';

const PODCAST_PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5] as const;
export const PODCAST_CHROME_AUTO_HIDE_MS = 3000;
export type PodcastPlayerErrorMessageKey =
  | 'podcasts.player.errors.loadEpisode'
  | 'podcasts.player.errors.saveProgress'
  | 'podcasts.player.errors.completionThreshold';

export function podcastPlayerErrorMessageKey(
  error: PodcastPlayerError,
): PodcastPlayerErrorMessageKey {
  switch (error) {
    case 'load-episode': return 'podcasts.player.errors.loadEpisode';
    case 'save-progress': return 'podcasts.player.errors.saveProgress';
    case 'completion-threshold': return 'podcasts.player.errors.completionThreshold';
  }
}

export function nextPodcastPlaybackSpeed(currentSpeed: number): number {
  const currentIndex = PODCAST_PLAYBACK_SPEEDS.findIndex(speed => speed === currentSpeed);
  return PODCAST_PLAYBACK_SPEEDS[(currentIndex + 1) % PODCAST_PLAYBACK_SPEEDS.length];
}

@Component({
  selector: 'lc-podcast-player', standalone: true,
  imports: [
    IonButton, IonContent, IonIcon, IonRange, IonSpinner, OfflineImageDirective,
    PodcastTranscriptComponent, TranslatePipe,
  ],
  providers: [PodcastPlayerStore, PodcastImmersiveModeService, ScreenAwakeService], templateUrl: './podcast-player.page.html',
  styleUrl: './podcast-player.page.scss', changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PodcastPlayerPage implements OnInit, ViewWillLeave {
  readonly store = inject(PodcastPlayerStore);
  readonly immersiveMode = inject(PodcastImmersiveModeService);
  readonly screenAwake = inject(ScreenAwakeService);
  readonly chromeVisible = signal(true);
  readonly transcriptOpen = signal(false);
  readonly isChromeVisible = computed(
    () => this.transcriptOpen() || !this.immersiveMode.isLandscape() || this.chromeVisible(),
  );
  readonly errorMessageKey = podcastPlayerErrorMessageKey;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly destroyRef = inject(DestroyRef);
  private readonly playerHost = viewChild<ElementRef<HTMLElement>>('playerHost');
  private readonly audio = viewChild<ElementRef<HTMLAudioElement>>('audioPlayer');
  private autoplayNext = false;
  private chromeAutoHideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    addIcons({
      arrowBackOutline, arrowRedoOutline, arrowUndoOutline, eyeOffOutline, eyeOutline,
      contractOutline, documentTextOutline, expandOutline, moonOutline, pause, play, repeatOutline,
      speedometerOutline, sunnyOutline,
    });
    this.destroyRef.onDestroy(() => {
      this.clearChromeAutoHide();
      this.stopAudioPlayback();
    });
  }

  ngOnInit(): void {
    combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(
      map(([pathParams, queryParams]) => ({
        episodeId: pathParams.get('episodeId') ?? '',
        isTopicQueue: queryParams.get('scope') === 'topic',
        playbackQueue: queryParams.get('queue') ?? '',
        repeatTopic: queryParams.get('repeat') === 'topic',
        autoplay: queryParams.get('autoplay') === '1',
      })),
      distinctUntilChanged((previous, current) => (
        previous.episodeId === current.episodeId
        && previous.isTopicQueue === current.isTopicQueue
        && previous.playbackQueue === current.playbackQueue
        && previous.repeatTopic === current.repeatTopic
        && previous.autoplay === current.autoplay
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(config => {
      this.transcriptOpen.set(false);
      this.store.playbackScopeChanged(config.isTopicQueue);
      this.store.playbackQueueChanged(
        config.playbackQueue.split(',').filter(episodeId => episodeId.length > 0),
      );
      this.store.repeatModeChanged(config.repeatTopic ? 'topic' : 'off');
      this.autoplayNext = config.autoplay;
      this.store.loadEpisode(config.episodeId);
    });
  }

  ionViewWillLeave(): void {
    this.clearChromeAutoHide();
    this.stopAudioPlayback();
    void this.screenAwake.playbackStopped();
    void this.immersiveMode.restorePortrait();
  }
  async goBack(topicId: string): Promise<void> {
    this.clearChromeAutoHide();
    await this.immersiveMode.restorePortrait();
    this.clearChromeAutoHide();
    this.chromeVisible.set(true);
    await this.router.navigate(['/podcasts/topics', topicId]);
  }
  async enterImmersiveMode(): Promise<void> {
    const playerHost = this.playerHost()?.nativeElement;
    if (!playerHost) return;

    this.clearChromeAutoHide();
    await this.immersiveMode.enter(playerHost);
    this.chromeVisible.set(!this.immersiveMode.isImmersive());
  }
  async exitImmersiveMode(): Promise<void> {
    this.clearChromeAutoHide();
    await this.immersiveMode.exit();
    this.clearChromeAutoHide();
    this.chromeVisible.set(true);
  }
  playerSurfaceTapped(event: MouseEvent): void {
    if (this.transcriptOpen()) return;
    if (!this.immersiveMode.isLandscape()) return;
    if (this.isInteractiveTarget(event.target)) return;

    if (!this.chromeVisible()) {
      this.chromeVisible.set(true);
      this.scheduleChromeAutoHide();
      return;
    }

    if (this.store.isPlaying()) {
      this.chromeVisible.set(false);
      this.clearChromeAutoHide();
    }
  }
  chromeInteracted(event: Event): void {
    event.stopPropagation();
    this.chromeVisible.set(true);
    this.scheduleChromeAutoHide();
  }
  chromeFocused(): void {
    this.chromeVisible.set(true);
    this.clearChromeAutoHide();
  }
  chromeFocusLeft(event: FocusEvent): void {
    if (
      event.currentTarget instanceof HTMLElement
      && event.relatedTarget instanceof Node
      && event.currentTarget.contains(event.relatedTarget)
    ) return;
    this.scheduleChromeAutoHide();
  }
  togglePlayback(): void {
    const audio = this.audio()?.nativeElement;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }
  rewind(): void {
    const audio = this.audio()?.nativeElement;
    if (audio) audio.currentTime = Math.max(0, audio.currentTime - 10);
  }
  forward(): void {
    const audio = this.audio()?.nativeElement;
    if (audio) audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 10);
  }
  seek(value: unknown): void {
    if (typeof value !== 'number') return;
    const audio = this.audio()?.nativeElement;
    if (audio) audio.currentTime = value / 1000;
  }
  timeChanged(event: Event): void { if (event.target instanceof HTMLAudioElement) this.store.playbackTimeChanged(Math.round(event.target.currentTime * 1000)); }
  prepareAudio(event: Event): void {
    if (!(event.target instanceof HTMLAudioElement)) return;
    event.target.defaultPlaybackRate = 1;
    event.target.playbackRate = this.store.speed();
    event.target.preservesPitch = true;
    event.target.currentTime = this.store.currentTimeMs() / 1000;
  }
  started(): void {
    this.autoplayNext = false;
    this.store.playbackStateChanged(true);
    void this.screenAwake.playbackStarted();
    this.scheduleChromeAutoHide();
  }
  paused(event: Event): void {
    this.store.playbackStateChanged(false);
    this.clearChromeAutoHide();
    if (this.immersiveMode.isImmersive() || this.immersiveMode.isLandscape()) {
      this.chromeVisible.set(true);
    }
    if (this.autoplayNext) return;
    if (event.target instanceof HTMLAudioElement && event.target.ended) return;
    void this.screenAwake.playbackStopped();
    this.store.persistProgress(false);
  }
  playbackFailed(): void {
    this.autoplayNext = false;
    this.store.playbackStateChanged(false);
    this.clearChromeAutoHide();
    this.chromeVisible.set(true);
    void this.screenAwake.playbackStopped();
  }
  async completed(): Promise<void> {
    const currentEpisodeId = this.store.episode()?.id;
    const nextEpisodeId = this.store.nextPlaybackTarget();
    const pointsAwarded = await this.store.completeCurrentEpisode();
    if (pointsAwarded === null || !currentEpisodeId) {
      void this.screenAwake.playbackStopped();
      return;
    }
    if (currentEpisodeId && nextEpisodeId === currentEpisodeId) {
      const audio = this.audio()?.nativeElement;
      if (audio) {
        audio.currentTime = 0;
        this.store.playbackTimeChanged(0);
        void audio.play();
      }
      return;
    }
    if (!nextEpisodeId) {
      void this.screenAwake.playbackStopped();
      await this.router.navigate(
        ['/podcasts/episodes', currentEpisodeId, 'complete'], {
          replaceUrl: true,
          queryParams: pointsAwarded > 0 ? { earned: pointsAwarded } : undefined,
        },
      );
      return;
    }
    this.autoplayNext = true;
    const audio = this.audio()?.nativeElement;
    if (audio) audio.autoplay = true;
    this.replacePlayerUrl(nextEpisodeId);
    this.store.loadEpisode(nextEpisodeId);
  }
  toggleRepeat(): void {
    this.store.repeatModeChanged(this.store.repeatMode() === 'off' ? 'episode' : 'off');
  }
  toggleSleepAllowed(): void { void this.screenAwake.toggleSleepAllowed(); }
  toggleSubtitles(): void {
    this.store.translationModeChanged(
      this.store.translationMode() === 'target' ? 'both' : 'target',
    );
  }
  openTranscript(): void {
    this.clearChromeAutoHide();
    this.chromeVisible.set(true);
    this.transcriptOpen.set(true);
  }
  closeTranscript(): void {
    this.transcriptOpen.set(false);
    this.scheduleChromeAutoHide();
  }
  changeSpeed(): void {
    const speed = nextPodcastPlaybackSpeed(this.store.speed());
    this.store.speedChanged(speed);
    const audio = this.audio()?.nativeElement;
    if (!audio) return;
    audio.defaultPlaybackRate = speed;
    audio.playbackRate = speed;
  }
  speakerName(speakerId: string): string { return this.store.episode()?.speakers.find(speaker => speaker.id === speakerId)?.name ?? 'Speaker'; }
  time(ms: number): string { const seconds = Math.floor(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
  readyToPlay(): void {
    if (!this.autoplayNext) return;
    void this.audio()?.nativeElement.play().catch(() => undefined);
  }

  private stopAudioPlayback(): void {
    const audio = this.audio()?.nativeElement;
    if (!audio || audio.paused) return;
    audio.pause();
  }

  private scheduleChromeAutoHide(): void {
    this.clearChromeAutoHide();
    if (!this.chromeVisible() || !this.store.isPlaying() || this.transcriptOpen()) return;
    if (!this.immersiveMode.isLandscape()) return;

    this.chromeAutoHideTimer = setTimeout(() => {
      this.chromeVisible.set(false);
      this.chromeAutoHideTimer = null;
    }, PODCAST_CHROME_AUTO_HIDE_MS);
  }

  private clearChromeAutoHide(): void {
    if (this.chromeAutoHideTimer === null) return;
    clearTimeout(this.chromeAutoHideTimer);
    this.chromeAutoHideTimer = null;
  }

  private isInteractiveTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return target.closest('ion-button, ion-range, button, a, [role="button"]') !== null;
  }

  private playbackQueryParams(): Record<string, string> {
    const playbackQueue = this.store.playbackQueue();
    return {
      scope: 'topic',
      autoplay: '1',
      ...(playbackQueue.length ? { queue: playbackQueue.join(',') } : {}),
      ...(this.store.repeatMode() === 'topic' ? { repeat: 'topic' } : {}),
    };
  }

  private replacePlayerUrl(episodeId: string): void {
    this.location.replaceState(
      `/podcasts/episodes/${encodeURIComponent(episodeId)}/player`,
      new URLSearchParams(this.playbackQueryParams()).toString(),
    );
  }
}
