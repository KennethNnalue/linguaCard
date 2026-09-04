import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { Story } from '@lingua-card/shared/domain';
import { StoryStore } from '../../store/story.store';
import { StoryApiService } from '../../services/story-api.service';
import { StoryPlayerService } from '../../services/story-player.service';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'lc-story-complete',
  templateUrl: './story-complete.page.html',
  styleUrls: ['./story-complete.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, TranslatePipe],
})
export class StoryCompletePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly storyStore = inject(StoryStore);
  private readonly api = inject(StoryApiService);
  private readonly player = inject(StoryPlayerService);
  private readonly translate = inject(TranslateService);

  readonly story = signal<Story | null>(null);
  readonly pointsAwarded = Number(this.route.snapshot.queryParamMap.get('earned') ?? 0);

  // Quiz result captured at completion (null when the quiz wasn't attempted).
  readonly quizScore = this.player.lastQuizScore;
  readonly quizTotal = this.player.lastQuizTotal;
  readonly quizDone = computed(() => this.quizScore() !== null && this.quizTotal() > 0);
  readonly quizScoreLabel = computed(() => `${this.quizScore()} / ${this.quizTotal()}`);

  readonly nextStory = this.player.nextStory;

  readonly metaLine = computed(() => {
    const s = this.story();
    if (!s) return '';
    const mins = Math.max(1, Math.ceil(s.audioDurationMs / 60000));
    return `${s.difficultyLevel} · ${mins} ${this.translate.instant('stories.cardMeta.min')}`;
  });

  private static readonly GRADIENTS = [
    'linear-gradient(140deg,#2E5547,#6E9C88)',
    'linear-gradient(140deg,#36544C,#86A99A)',
    'linear-gradient(145deg,#7C4A2E,#C2703D)',
    'linear-gradient(140deg,#22403A,#4E8C76)',
    'linear-gradient(140deg,#566A4E,#9DB08C)',
    'linear-gradient(145deg,#3E4F6B,#7D8FA8)',
  ];

  coverGradient(s: Story): string {
    const code = s.id.split('').reduce((n, c) => n + c.charCodeAt(0), 0);
    return StoryCompletePage.GRADIENTS[code % StoryCompletePage.GRADIENTS.length];
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
  }

  goToLibrary(): void {
    this.router.navigate(['/stories']);
  }

  /** Replay restarts playback from the top of this story. */
  replayStory(): void {
    const s = this.story();
    if (s) this.router.navigate(['/stories', s.id], { queryParams: { autoPlay: '1' } });
  }

  playNext(): void {
    const next = this.nextStory();
    if (next) {
      this.router.navigate(['/stories', next.id], { queryParams: { autoPlay: '1' } });
    } else {
      this.goToLibrary();
    }
  }
}
