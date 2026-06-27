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
import { ListenEqualizerComponent } from '../../components/listen-equalizer/listen-equalizer.component';
import { ListenWordCardComponent } from '../../components/listen-word-card/listen-word-card.component';
import { ListenTeleprompterComponent } from '../../components/listen-teleprompter/listen-teleprompter.component';
import { ListenModeSelectorComponent } from '../../components/listen-mode-selector/listen-mode-selector.component';
import { ListenSpeedChipsComponent } from '../../components/listen-speed-chips/listen-speed-chips.component';
import { ListenTransportComponent } from '../../components/listen-transport/listen-transport.component';

@Component({
  selector: 'lc-now-playing',
  templateUrl: './now-playing.page.html',
  styleUrl: './now-playing.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonContent, IonHeader, IonToolbar, IonSpinner, TranslatePipe,
    ListenEqualizerComponent,
    ListenWordCardComponent,
    ListenTeleprompterComponent,
    ListenModeSelectorComponent,
    ListenSpeedChipsComponent,
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

  /** All visible (non-silence, non-hero) segments for the active card. */
  private readonly segmentViewModels = computed<SegmentViewModel[]>(() => {
    const script = this.listenStore.currentScript();
    if (!script) return [];

    const visible = script.segments.filter(s =>
      s.type !== 'silence' && s.type !== 'word_target' && s.type !== 'word_native'
    );
    const segIdx = this.listenStore.segmentIndex();
    const activeSeg = script.segments[segIdx];
    const activeVisibleIdx = (!activeSeg || activeSeg.type === 'silence')
      ? -1
      : visible.findIndex(s => s === activeSeg);

    return visible.map((seg, i) => ({
      text: seg.text,
      langLabel: seg.type === 'grammar_tip' ? 'TIP' : seg.lang.toUpperCase(),
      cls: i < activeVisibleIdx ? 'played' : i === activeVisibleIdx ? 'playing' : '',
    }));
  });

  /** The three rows shown in the teleprompter: last played / current / first upcoming. */
  readonly teleprompter = computed<{
    prev: SegmentViewModel | null;
    current: SegmentViewModel | null;
    next: SegmentViewModel | null;
  }>(() => {
    const vms = this.segmentViewModels();
    const activeIdx = vms.findIndex(v => v.cls === 'playing');

    if (activeIdx >= 0) {
      return {
        prev: activeIdx > 0 ? vms[activeIdx - 1] : null,
        current: vms[activeIdx],
        next: activeIdx < vms.length - 1 ? vms[activeIdx + 1] : null,
      };
    }
    // No active segment (e.g. hero word playing or between cards).
    return {
      prev: [...vms].reverse().find(v => v.cls === 'played') ?? null,
      current: null,
      next: vms.find(v => v.cls === '') ?? null,
    };
  });

  readonly grammarNote = computed(() => {
    const card = this.listenStore.currentCard();
    return this.listenStore.playMode() === 'deepDive' ? (card?.content?.notes ?? '') : '';
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

  goBack(): void {
    this.listenStore.stopAudio();
    this.listenStore.pause();
    this.navCtrl.back();
  }
}
