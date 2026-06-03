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
import { IonContent, IonHeader, IonToolbar } from '@ionic/angular/standalone';
import { PlayMode } from '@lingua-card/shared/domain';
import { ListenStore } from '../../store/listen.store';
import { ArticleBadgeComponent } from '../../../../shared/components/article-badge/article-badge.component';
import { PLAY_MODE_OPTIONS, PLAYBACK_SPEEDS, PlaybackSpeed } from '../../models/listen.models';

interface SegmentViewModel {
  text: string;
  langLabel: string;
  cls: '' | 'played' | 'playing';
}

@Component({
  selector: 'lc-now-playing',
  templateUrl: './now-playing.page.html',
  styleUrl: './now-playing.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonHeader, IonToolbar, ArticleBadgeComponent],
})
export class NowPlayingPage {
  protected readonly listenStore = inject(ListenStore);
  private readonly router = inject(Router);
  private readonly navCtrl = inject(NavController);

  readonly MODES = PLAY_MODE_OPTIONS;
  readonly SPEEDS = PLAYBACK_SPEEDS;

  // M6 fix: register side effects at field level, not in constructor body
  // Signal so effect() re-runs reactively when the guard flips
  private readonly _readyToRedirect = signal(false);
  private readonly _redirectEffect = effect(() => {
    if (this._readyToRedirect() && this.listenStore.status() === 'complete') {
      this.router.navigate(['/listen/complete'], { replaceUrl: true });
    }
  });

  private readonly _destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => this._readyToRedirect.set(true));
    this._destroyRef.onDestroy(() => {
      if (this.listenStore.status() !== 'complete') {
        this.listenStore.stopAudio();
        this.listenStore.pause();
      }
    });
  }

  // Named derived state — isPlaying/isError used by name in template
  readonly isPlaying = computed(() => this.listenStore.status() === 'playing');
  readonly isError   = computed(() => this.listenStore.status() === 'error');

  // M5 fix: use the store's progressPercent directly — no local duplication
  readonly progressPercent = this.listenStore.progressPercent;

  // H1 fix: build a typed view-model array instead of calling plain methods per segment
  readonly segmentViewModels = computed<SegmentViewModel[]>(() => {
    const script = this.listenStore.currentScript();
    if (!script) return [];

    // word_target / word_native are shown in the hero block — exclude from the track
    const visible = script.segments.filter(s =>
      s.type !== 'silence' && s.type !== 'word_target' && s.type !== 'word_native'
    );
    const segIdx  = this.listenStore.segmentIndex();
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

  readonly grammarNote = computed(() => {
    const card = this.listenStore.currentCard();
    return this.listenStore.playMode() === 'deepDive' ? (card?.content?.notes ?? '') : '';
  });

  // H4 fix: togglePlay is safe in all states — guards handled per action
  togglePlay(): void {
    if (this.isPlaying()) {
      this.listenStore.pause();
    } else if (this.isError()) {
      this.listenStore.retrySegment();
    } else {
      this.listenStore.resume(); // no-ops when not paused (guard is in store.resume())
    }
  }

  next(): void     { this.listenStore.next(); }
  previous(): void { this.listenStore.previous(); }
  retry(): void    { this.listenStore.retrySegment(); }
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
    // C1 fix: stop audio before navigating so the utterance doesn't keep playing
    this.listenStore.stopAudio();
    this.listenStore.pause();
    this.navCtrl.back();
  }

  goComplete(): void {
    this.router.navigate(['/listen/complete']);
  }
}
