import {
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  playOutline,
  pauseOutline,
  playSkipBackOutline,
  languageOutline,
} from 'ionicons/icons';
import { Story, WordTimestamp } from '../../../../core/models/mock-data';
import { StoryStore } from '../../store/story.store';
import { StoryApiService } from '../../services/story-api.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-story-reader',
  templateUrl: './story-reader.page.html',
  styleUrls: ['./story-reader.page.scss'],
  imports: [IonContent, IonHeader, IonToolbar, IonIcon, NgClass],
})
export class StoryReaderPage implements OnInit, OnDestroy {
  @ViewChild('audioEl') audioElRef!: ElementRef<HTMLAudioElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly storyStore = inject(StoryStore);
  private readonly api = inject(StoryApiService);

  readonly story = signal<Story | null>(null);
  readonly showTranslation = signal(false);
  readonly isPlaying = signal(false);
  readonly activeWordIdx = signal(-1);
  readonly speed = signal(1.0);
  readonly progressPct = signal(0);

  private audio: HTMLAudioElement | null = null;
  private timeupdateHandler: (() => void) | null = null;
  private endedHandler: (() => void) | null = null;

  readonly speeds = [0.5, 0.75, 1.0, 1.25, 1.5];

  readonly speedLabel = computed(() => `${this.speed()}×`);

  readonly words = computed<Array<WordTimestamp & { idx: number }>>(() => {
    const s = this.story();
    if (!s) return [];
    return s.wordTimestamps.map((w, i) => ({ ...w, idx: i }));
  });

  constructor() {
    addIcons({
      arrowBackOutline,
      playOutline,
      pauseOutline,
      playSkipBackOutline,
      languageOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    let s = this.storyStore.getById(id);
    if (!s) {
      try {
        s = await firstValueFrom(this.api.getById(id));
      } catch {
        this.router.navigate(['/stories']);
        return;
      }
    }
    this.story.set(s);

    if (s.audioUrl) {
      this.initAudio(s.audioUrl, s.wordTimestamps);
    }
  }

  ngOnDestroy(): void {
    this.destroyAudio();
  }

  private initAudio(url: string, timestamps: WordTimestamp[]): void {
    this.audio = new Audio(url);
    this.audio.playbackRate = this.speed();

    this.timeupdateHandler = () => {
      const ms = (this.audio!.currentTime * 1000);
      const dur = this.audio!.duration * 1000 || 1;
      this.progressPct.set(Math.min(100, (ms / dur) * 100));

      const idx = timestamps.findIndex(w => ms >= w.startMs && ms < w.endMs);
      this.activeWordIdx.set(idx);
    };

    this.endedHandler = () => {
      this.isPlaying.set(false);
      this.activeWordIdx.set(-1);
      this.storyStore.incrementListenCount(this.story()!.id);
      void this.router.navigate(['/stories', this.story()!.id, 'complete']);
    };

    this.audio.addEventListener('timeupdate', this.timeupdateHandler);
    this.audio.addEventListener('ended', this.endedHandler);
  }

  private destroyAudio(): void {
    if (this.audio) {
      if (this.timeupdateHandler) this.audio.removeEventListener('timeupdate', this.timeupdateHandler);
      if (this.endedHandler) this.audio.removeEventListener('ended', this.endedHandler);
      this.audio.pause();
      this.audio = null;
    }
  }

  togglePlay(): void {
    if (!this.audio) return;
    if (this.isPlaying()) {
      this.audio.pause();
      this.isPlaying.set(false);
    } else {
      void this.audio.play();
      this.isPlaying.set(true);
    }
  }

  restart(): void {
    if (!this.audio) return;
    this.audio.currentTime = 0;
    this.activeWordIdx.set(-1);
    this.progressPct.set(0);
    if (this.isPlaying()) {
      void this.audio.play();
    }
  }

  cycleSpeed(): void {
    const idx = this.speeds.indexOf(this.speed());
    const next = this.speeds[(idx + 1) % this.speeds.length];
    this.speed.set(next);
    if (this.audio) this.audio.playbackRate = next;
  }

  toggleTranslation(): void {
    this.showTranslation.update(v => !v);
  }

  goBack(): void {
    this.router.navigate(['/stories']);
  }

  isVocabActive(wt: WordTimestamp & { idx: number }): boolean {
    return wt.isVocab && wt.idx === this.activeWordIdx();
  }
}
