import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { NavController } from '@ionic/angular';
import { IonContent, IonHeader, IonToolbar, IonSpinner } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { PlayMode } from '@lingua-card/shared/domain';
import { ListenStore } from '../../store/listen.store';
import { PLAY_MODE_OPTIONS, PLAYBACK_SPEEDS, PlaybackSpeed, SegmentViewModel } from '../../models/listen.models';
import { ListenWordCardComponent } from '../../components/listen-word-card/listen-word-card.component';
import { ListenTeleprompterComponent } from '../../components/listen-teleprompter/listen-teleprompter.component';
import { ListenModeSelectorComponent } from '../../components/listen-mode-selector/listen-mode-selector.component';
import { ListenTransportComponent } from '../../components/listen-transport/listen-transport.component';

@Component({
  selector: 'lc-now-playing',
  templateUrl: './now-playing.page.html',
  styleUrl: './now-playing.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonContent, IonHeader, IonToolbar, IonSpinner, TranslatePipe,
    ListenWordCardComponent,
    ListenTeleprompterComponent,
    ListenModeSelectorComponent,
    ListenTransportComponent,
  ],
})
export class NowPlayingPage {
  protected readonly listenStore = inject(ListenStore);
  private readonly router = inject(Router);
  private readonly navCtrl = inject(NavController);
  private readonly _destroyRef = inject(DestroyRef);

  readonly MODES = PLAY_MODE_OPTIONS;
  readonly SPEEDS = PLAYBACK_SPEEDS;
  readonly queueOpen = signal(false);

  // Signal so the effect re-runs reactively once the guard flips.
  private readonly _readyToRedirect = signal(false);
  private readonly _redirectEffect = effect(() => {
    if (this._readyToRedirect() && this.listenStore.status() === 'complete') {
      this.router.navigate(['/listen/complete'], { replaceUrl: true });
    }
  });

  constructor() {
    afterNextRender(() => this._readyToRedirect.set(true));
    this._destroyRef.onDestroy(() => {
      if (this.listenStore.status() !== 'complete') {
        this.listenStore.stopAudio();
        this.listenStore.pause();
      }
    });
  }

  readonly isPlaying = computed(() => this.listenStore.status() === 'playing');
  readonly isError = computed(() => this.listenStore.status() === 'error');
  readonly isPreparing = computed(() => this.listenStore.status() === 'loading');

  readonly progressPercent = this.listenStore.progressPercent;

  readonly segmentViewModels = computed<SegmentViewModel[]>(() => {
    const script = this.listenStore.currentScript();
    if (!script) return [];

    const visible = script.segments.filter(segment => segment.type !== 'silence');
    const segIdx = this.listenStore.segmentIndex();
    const activeSeg = script.segments[segIdx];
    const activeVisibleIdx = (!activeSeg || activeSeg.type === 'silence')
      ? -1
      : visible.findIndex(s => s === activeSeg);

    return visible.map((seg, i) => ({
      text: seg.text,
      langLabel: seg.language.split('-')[0]?.toUpperCase() ?? '',
      cls: i < activeVisibleIdx ? 'played' : i === activeVisibleIdx ? 'playing' : '',
    }));
  });

  togglePlay(): void {
    if (this.isPlaying()) {
      this.listenStore.pause();
    } else if (this.isError()) {
      this.listenStore.retrySegment();
    } else {
      this.listenStore.resume();
    }
  }

  next(): void { this.listenStore.next(); }
  previous(): void { this.listenStore.previous(); }
  retry(): void { this.listenStore.retrySegment(); }
  skipCard(): void { this.listenStore.skipCard(); }

  toggleShuffle(): void {
    this.listenStore.updateSettings({ shuffle: !this.listenStore.isShuffled() });
  }

  toggleRepeat(): void {
    this.listenStore.updateSettings({ repeat: !this.listenStore.isRepeat() });
  }

  setMode(mode: PlayMode): void {
    this.listenStore.updateSettings({ playMode: mode });
  }

  setSpeed(speed: PlaybackSpeed): void {
    this.listenStore.updateSettings({ speed });
  }

  cycleSpeed(): void {
    const currentIndex = this.SPEEDS.indexOf(this.listenStore.speed());
    const nextSpeed = this.SPEEDS[(currentIndex + 1) % this.SPEEDS.length];
    this.setSpeed(nextSpeed);
  }

  toggleQueue(): void {
    this.queueOpen.update(open => !open);
  }

  goBack(): void {
    this.listenStore.stopAudio();
    this.listenStore.pause();
    this.navCtrl.back();
  }
}
