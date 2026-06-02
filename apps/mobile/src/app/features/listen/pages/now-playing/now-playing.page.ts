import { afterNextRender, ChangeDetectionStrategy, Component, computed, effect, inject, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { NavController } from '@ionic/angular';
import { IonContent, IonHeader, IonToolbar } from '@ionic/angular/standalone';
import { ListenStore } from '../../store/listen.store';
import { ArticleBadgeComponent } from '../../../../shared/components/article-badge/article-badge.component';

@Component({
  selector: 'lc-now-playing',
  templateUrl: './now-playing.page.html',
  styleUrls: ['./now-playing.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonHeader, IonToolbar, ArticleBadgeComponent],
})
export class NowPlayingPage implements OnDestroy {
  private readonly listenStore = inject(ListenStore);
  private readonly router = inject(Router);
  private readonly navCtrl = inject(NavController);

  // Guard: only redirect to complete after the first render so that
  // arriving on this page while status is already 'complete' (stale store
  // state) doesn't immediately bounce the user away before playback starts.
  private _readyToRedirect = false;

  constructor() {
    afterNextRender(() => {
      this._readyToRedirect = true;
    });

    effect(() => {
      if (this._readyToRedirect && this.status() === 'complete') {
        this.router.navigate(['/listen/complete'], { replaceUrl: true });
      }
    });
  }

  readonly currentCard = this.listenStore.currentCard;
  readonly currentScript = this.listenStore.currentScript;
  readonly segmentIndex = this.listenStore.segmentIndex;
  readonly cardIndex = this.listenStore.cardIndex;
  readonly queue = this.listenStore.queue;
  readonly status = this.listenStore.status;
  readonly playMode = this.listenStore.playMode;
  readonly speed = this.listenStore.speed;
  readonly isShuffled = this.listenStore.isShuffled;
  readonly isRepeat = this.listenStore.isRepeat;
  readonly estimatedMinutes = this.listenStore.estimatedMinutes;
  readonly errorMessage = this.listenStore.errorMessage;

  readonly isPlaying = computed(() => this.status() === 'playing');
  readonly isError = computed(() => this.status() === 'error');

  readonly progressPercent = computed(() => {
    const len = this.queue().length;
    return len ? (this.cardIndex() / len) * 100 : 0;
  });

  readonly visibleSegments = computed(() => {
    const script = this.currentScript();
    if (!script) return [];
    return script.segments.filter(s => s.type !== 'silence');
  });

  readonly activeVisibleSegmentIndex = computed(() => {
    const script = this.currentScript();
    const segIdx = this.segmentIndex();
    if (!script) return -1;
    const activeSeg = script.segments[segIdx];
    if (!activeSeg || activeSeg.type === 'silence') return -1;
    return this.visibleSegments().findIndex(s => s === activeSeg);
  });

  readonly MODES = [
    { value: 'compact' as const, label: 'Compact', desc: 'Word + meaning' },
    { value: 'examples' as const, label: 'Examples', desc: 'Full sentences' },
    { value: 'deepDive' as const, label: 'Deep Dive', desc: '+ grammar tip' },
  ];

  readonly SPEEDS = [0.75 as const, 1 as const, 1.25 as const, 1.5 as const];

  readonly grammarNote = computed(() => {
    const card = this.currentCard();
    return this.playMode() === 'deepDive' ? (card?.content?.notes ?? '') : '';
  });

  segmentClass(idx: number): string {
    const activeIdx = this.activeVisibleSegmentIndex();
    if (idx < activeIdx) return 'played';
    if (idx === activeIdx) return 'playing';
    return '';
  }

  segmentLang(idx: number): string {
    const seg = this.visibleSegments()[idx];
    if (!seg) return '';
    if (seg.type === 'grammar_tip') return 'TIP';
    return seg.lang.toUpperCase();
  }

  togglePlay(): void {
    if (this.isPlaying()) {
      this.listenStore.pause();
    } else {
      this.listenStore.resume();
    }
  }

  next(): void { this.listenStore.next(); }
  previous(): void { this.listenStore.previous(); }
  retry(): void { this.listenStore.retrySegment(); }
  skipCard(): void { this.listenStore.skipCard(); }

  toggleShuffle(): void {
    this.listenStore.updateSettings({ shuffle: !this.isShuffled() });
  }

  toggleRepeat(): void {
    this.listenStore.updateSettings({ repeat: !this.isRepeat() });
  }

  setMode(mode: 'compact' | 'examples' | 'deepDive'): void {
    this.listenStore.updateSettings({ playMode: mode });
  }

  setSpeed(speed: 0.75 | 1 | 1.25 | 1.5): void {
    this.listenStore.updateSettings({ speed });
  }

  goBack(): void {
    this.listenStore.pause();
    this.navCtrl.back();
  }

  goComplete(): void {
    this.router.navigate(['/listen/complete']);
  }

  ngOnDestroy(): void {
    if (this.status() === 'complete') return;
    this.listenStore.pause();
  }
}
