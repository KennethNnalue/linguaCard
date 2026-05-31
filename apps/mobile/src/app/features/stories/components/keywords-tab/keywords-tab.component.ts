import { Component, input, output, signal } from '@angular/core';
import type { StoryKeyword } from '@lingua-card/shared/domain';

@Component({
  selector: 'lc-keywords-tab',
  templateUrl: './keywords-tab.component.html',
  styleUrls: ['./keywords-tab.component.scss'],
})
export class KeywordsTabComponent {
  readonly keywords = input<StoryKeyword[]>([]);
  readonly loading = input<boolean>(false);
  readonly pronunciationLoading = input<boolean>(false);

  // Track which keyword is currently playing so only its button shows a spinner
  readonly playingGermanBase = signal<string | null>(null);

  readonly playWord = output<StoryKeyword>();
  readonly addToTraining = output<StoryKeyword>();
  readonly memorizeAll = output<void>();

  onPlayWord(kw: StoryKeyword): void {
    this.playingGermanBase.set(kw.germanBase);
    this.playWord.emit(kw);
    // Clear the active-play marker once the global loading flag drops
    const interval = setInterval(() => {
      if (!this.pronunciationLoading()) {
        this.playingGermanBase.set(null);
        clearInterval(interval);
      }
    }, 100);
  }

  isThisPlaying(kw: StoryKeyword): boolean {
    return this.pronunciationLoading() && this.playingGermanBase() === kw.germanBase;
  }

  levelStyle(level: string): { background: string; color: string } {
    const map: Record<string, { background: string; color: string }> = {
      A1: { background: '#D1FAE5', color: '#059669' },
      A2: { background: '#D1FAE5', color: '#059669' },
      B1: { background: '#FEF3C7', color: '#D97706' },
      B2: { background: '#EAF2FC', color: '#1A56A3' },
      C1: { background: '#EDE9FE', color: '#6D28D9' },
      C2: { background: '#EDE9FE', color: '#6D28D9' },
    };
    return map[level] ?? { background: '#F1EFE8', color: '#5F5E5A' };
  }
}
