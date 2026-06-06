import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { IonToggle } from '@ionic/angular/standalone';
import type { StoryQuizQuestion } from '@lingua-card/shared/domain';
import { WordAudioService } from '../../../../shared/audio/word-audio.service';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

@Component({
  selector: 'lc-quiz-tab',
  templateUrl: './quiz-tab.component.html',
  styleUrls: ['./quiz-tab.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, IonToggle],
})
export class QuizTabComponent {
  private readonly wordAudio = inject(WordAudioService);

  readonly questions = input<StoryQuizQuestion[]>([]);
  readonly loading = input<boolean>(false);
  readonly pronunciationLoading = input<boolean>(false);

  // State lifted to parent for persistence — passed in as models
  readonly currentIdx = model<number>(0);
  readonly answered = model<Record<string, string>>({});

  readonly showFeedback = signal(false);

  // Whether tapping an answer auto-plays its pronunciation
  readonly autoSpeak = signal(true);

  // When true: wrong answers require a manual "Next" tap before advancing.
  // When false: auto-advances after audio (or 1500ms) even on wrong answers.
  readonly pauseOnMistakes = signal(true);

  // Set to true while waiting for the user to tap "Next" after a wrong answer
  readonly waitingForNext = signal(false);

  // Track which question IDs have already been auto-played so revisiting doesn't replay
  private readonly playedQuestionIds = new Set<string>();

  readonly currentQuestion = computed(() => this.questions()[this.currentIdx()] ?? null);

  constructor() {
    // LC-332: auto-play sentence audio on question load (first visit only)
    effect(() => {
      const q = this.currentQuestion();
      if (q && !this.playedQuestionIds.has(q.id)) {
        this.playedQuestionIds.add(q.id);
        void this.wordAudio.play(q.sentenceTemplate, 'de-DE');
      }
    });
  }

  readonly progressLabel = computed(
    () => `${this.currentIdx() + 1}/${this.questions().length}`,
  );

  readonly progressPct = computed(() => {
    const total = this.questions().length;
    return total > 0 ? ((this.currentIdx() + 1) / total) * 100 : 0;
  });

  readonly progressDashOffset = computed(() => {
    const circumference = 2 * Math.PI * 30; // r=30
    const filled = (this.progressPct() / 100) * circumference;
    return circumference - filled;
  });

  // Memoised per question ID so shuffle runs once per question, not on every CD cycle.
  private readonly shuffledChoicesCache = new Map<string, string[]>();

  readonly choices = computed(() => {
    const q = this.currentQuestion();
    if (!q) return [];
    if (!this.shuffledChoicesCache.has(q.id)) {
      this.shuffledChoicesCache.set(q.id, shuffle([q.correctAnswer, ...q.distractors]));
    }
    return this.shuffledChoicesCache.get(q.id)!;
  });

  readonly isComplete = computed(
    () =>
      this.questions().length > 0 &&
      this.currentIdx() >= this.questions().length,
  );

  readonly correctCount = computed(() => {
    const ans = this.answered();
    return this.questions().filter(q => ans[q.id] === q.correctAnswer).length;
  });

  getChosenAnswer(): string | null {
    const q = this.currentQuestion();
    return q ? (this.answered()[q.id] ?? null) : null;
  }

  isWrongAnswer(): boolean {
    const chosen = this.getChosenAnswer();
    const q = this.currentQuestion();
    return !!chosen && !!q && chosen !== q.correctAnswer;
  }

  choiceClass(choice: string): Record<string, boolean> {
    const chosen = this.getChosenAnswer();
    const q = this.currentQuestion();
    if (!chosen || !q) return {};
    const isChosen = chosen === choice;
    const correct = choice === q.correctAnswer;
    return {
      'chosen-correct': isChosen && correct,
      'chosen-wrong': isChosen && !correct,
      'reveal-correct': !isChosen && correct && !!chosen,
    };
  }

  selectAnswer(choice: string): void {
    const q = this.currentQuestion();
    if (!q || this.showFeedback() || this.getChosenAnswer()) return;
    this.answered.update(m => ({ ...m, [q.id]: choice }));
    this.showFeedback.set(true);

    const wrong = choice !== q.correctAnswer;

    if (wrong && this.pauseOnMistakes()) {
      // Stay on feedback — user must tap "Next" to continue.
      // Still play audio so they hear the correct pronunciation.
      this.waitingForNext.set(true);
      if (this.autoSpeak()) {
        void this.wordAudio.playAsPromise(choice, 'de-DE');
      }
    } else {
      void this.advanceAfterAudio(choice);
    }
  }

  next(): void {
    this.waitingForNext.set(false);
    this.showFeedback.set(false);
    this.currentIdx.update(i => i + 1);
  }

  private async advanceAfterAudio(choice: string): Promise<void> {
    if (this.autoSpeak()) {
      await this.wordAudio.playAsPromise(choice, 'de-DE');
    } else {
      await new Promise<void>(r => setTimeout(r, 1500));
    }
    this.showFeedback.set(false);
    this.currentIdx.update(i => i + 1);
  }

  retake(): void {
    this.playedQuestionIds.clear();
    this.shuffledChoicesCache.clear();
    this.answered.set({});
    this.waitingForNext.set(false);
    this.showFeedback.set(false);
    // Bounce through -1 so the effect re-fires even when already at index 0,
    // ensuring auto-play triggers for question 0 after a retake.
    this.currentIdx.set(-1);
    this.currentIdx.set(0);
  }
}
