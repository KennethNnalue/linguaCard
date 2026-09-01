import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, OnInit, viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonButton, IonContent, IonIcon, IonRange,
} from '@ionic/angular/standalone';
import type { ViewWillLeave } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, arrowRedoOutline, arrowUndoOutline, eyeOffOutline, eyeOutline,
  pause, play, repeatOutline,
} from 'ionicons/icons';
import { PodcastPlayerStore } from '../../store/podcast-player.store';

@Component({
  selector: 'lc-podcast-player', standalone: true,
  imports: [
    IonButton, IonContent, IonIcon, IonRange,
  ],
  providers: [PodcastPlayerStore], templateUrl: './podcast-player.page.html',
  styleUrl: './podcast-player.page.scss', changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PodcastPlayerPage implements OnInit, ViewWillLeave {
  readonly store = inject(PodcastPlayerStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly audio = viewChild<ElementRef<HTMLAudioElement>>('audioPlayer');
  private autoplayNext = false;

  constructor() {
    addIcons({
      arrowBackOutline, arrowRedoOutline, arrowUndoOutline, eyeOffOutline, eyeOutline,
      pause, play, repeatOutline,
    });
    this.destroyRef.onDestroy(() => this.stopAudioPlayback());
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
    this.stopAudioPlayback();
  }
  goBack(topicId: string): void { void this.router.navigate(['/podcasts/topics', topicId]); }
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
  }
  paused(event: Event): void {
    this.store.playbackStateChanged(false);
    if (event.target instanceof HTMLAudioElement && event.target.ended) return;
    this.store.persistProgress(false);
  }
  async completed(): Promise<void> {
    const currentEpisodeId = this.store.episode()?.id;
    const nextEpisodeId = this.store.nextPlaybackTarget();
    if (currentEpisodeId && nextEpisodeId === currentEpisodeId) {
      const audio = this.audio()?.nativeElement;
      if (audio) {
        audio.currentTime = 0;
        this.store.playbackTimeChanged(0);
        void audio.play();
      }
      return;
    }
    if (!await this.store.completeCurrentEpisode() || !currentEpisodeId) return;
    if (!nextEpisodeId) {
      await this.router.navigate(
        ['/podcasts/episodes', currentEpisodeId, 'complete'], { replaceUrl: true },
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
