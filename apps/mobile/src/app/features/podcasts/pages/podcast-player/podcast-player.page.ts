import {
  ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, OnInit, signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonButton, IonContent, IonIcon, IonRange, IonSpinner,
} from '@ionic/angular/standalone';
import type { ViewWillLeave } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { TranslatePipe } from '@ngx-translate/core';
import {
  arrowBackOutline, arrowRedoOutline, arrowUndoOutline, eyeOffOutline, eyeOutline,
  contractOutline, expandOutline, pause, play, repeatOutline, speedometerOutline,
} from 'ionicons/icons';
import {
  type PodcastPlayerError, PodcastPlayerStore,
} from '../../store/podcast-player.store';
import { OfflineImageDirective } from '../../../../shared/image/offline-image.directive';
import { PodcastImmersiveModeService } from '../../services/podcast-immersive-mode.service';

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
    IonButton, IonContent, IonIcon, IonRange, IonSpinner, OfflineImageDirective, TranslatePipe,
  ],
  providers: [PodcastPlayerStore, PodcastImmersiveModeService], templateUrl: './podcast-player.page.html',
  styleUrl: './podcast-player.page.scss', changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PodcastPlayerPage implements OnInit, ViewWillLeave {
  readonly store = inject(PodcastPlayerStore);
  readonly immersiveMode = inject(PodcastImmersiveModeService);
  readonly chromeVisible = signal(true);
  readonly isChromeVisible = computed(
    () => !this.immersiveMode.isLandscape() || this.chromeVisible(),
  );
  readonly errorMessageKey = podcastPlayerErrorMessageKey;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly playerHost = viewChild<ElementRef<HTMLElement>>('playerHost');
  private readonly audio = viewChild<ElementRef<HTMLAudioElement>>('audioPlayer');
  private autoplayNext = false;
  private chromeAutoHideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    addIcons({
      arrowBackOutline, arrowRedoOutline, arrowUndoOutline, eyeOffOutline, eyeOutline,
      contractOutline, expandOutline, pause, play, repeatOutline, speedometerOutline,
    });
    this.destroyRef.onDestroy(() => {
      this.clearChromeAutoHide();
      this.stopAudioPlayback();
    });
  }

  ngOnInit(): void {
    const queryParams = this.route.snapshot.queryParamMap;
    this.store.playbackScopeChanged(queryParams.get('scope') === 'topic');
    this.store.playbackQueueChanged(
      queryParams.get('queue')?.split(',').filter(episodeId => episodeId.length > 0) ?? [],
    );
    this.store.repeatModeChanged(queryParams.get('repeat') === 'topic' ? 'topic' : 'off');
    this.autoplayNext = queryParams.get('autoplay') === '1';
    this.store.loadEpisode(this.route.snapshot.paramMap.get('episodeId') ?? '');
  }

  ionViewWillLeave(): void {
    this.clearChromeAutoHide();
    this.stopAudioPlayback();
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
    this.store.playbackStateChanged(true);
    this.scheduleChromeAutoHide();
  }
  paused(event: Event): void {
    this.store.playbackStateChanged(false);
    this.clearChromeAutoHide();
    if (this.immersiveMode.isImmersive() || this.immersiveMode.isLandscape()) {
      this.chromeVisible.set(true);
    }
    if (event.target instanceof HTMLAudioElement && event.target.ended) return;
    this.store.persistProgress(false);
  }
  playbackFailed(): void {
    this.store.playbackStateChanged(false);
    this.clearChromeAutoHide();
    this.chromeVisible.set(true);
  }
  async completed(): Promise<void> {
    const currentEpisodeId = this.store.episode()?.id;
    const nextEpisodeId = this.store.nextPlaybackTarget();
    const pointsAwarded = await this.store.completeCurrentEpisode();
    if (pointsAwarded === null || !currentEpisodeId) return;
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
      await this.router.navigate(
        ['/podcasts/episodes', currentEpisodeId, 'complete'], {
          replaceUrl: true,
          queryParams: pointsAwarded > 0 ? { earned: pointsAwarded } : undefined,
        },
      );
      return;
    }
    this.autoplayNext = true;
    await this.router.navigate(['/podcasts/episodes', nextEpisodeId, 'player'], {
      replaceUrl: true, queryParams: this.playbackQueryParams(),
    });
    this.store.loadEpisode(nextEpisodeId);
  }
  toggleRepeat(): void {
    this.store.repeatModeChanged(this.store.repeatMode() === 'episode' ? 'off' : 'episode');
  }
  toggleSubtitles(): void {
    this.store.translationModeChanged(
      this.store.translationMode() === 'target' ? 'both' : 'target',
    );
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
    this.autoplayNext = false;
    void this.audio()?.nativeElement.play();
  }

  private stopAudioPlayback(): void {
    const audio = this.audio()?.nativeElement;
    if (!audio || audio.paused) return;
    audio.pause();
  }

  private scheduleChromeAutoHide(): void {
    this.clearChromeAutoHide();
    if (!this.chromeVisible() || !this.store.isPlaying()) return;
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
}
