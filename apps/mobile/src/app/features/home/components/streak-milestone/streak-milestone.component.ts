import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { ReviewStatsStore } from '../../../review/store/review-stats.store';

const MILESTONES = [3, 7, 14, 30, 50, 100, 365];
const STORAGE_KEY = 'lc_last_celebrated_milestone';

@Component({
  selector: 'lc-streak-milestone',
  templateUrl: './streak-milestone.component.html',
  styleUrl: './streak-milestone.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StreakMilestoneComponent implements OnInit {
  private readonly modalCtrl = inject(ModalController);
  private readonly reviewStats = inject(ReviewStatsStore);

  readonly milestone = signal<number>(0);
  readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  ngOnInit(): void {
    const current = this.reviewStats.streak().current;
    const reached = MILESTONES.filter(m => m <= current);
    if (reached.length === 0) { void this.modalCtrl.dismiss(); return; }
    this.milestone.set(reached[reached.length - 1]);
  }

  get motivationText(): string {
    const m = this.milestone();
    if (m >= 365) return 'A full year of dedication. Absolutely incredible.';
    if (m >= 100) return 'Three digits! You are truly committed to your language journey.';
    if (m >= 50)  return 'Fifty days strong — your future self is grateful.';
    if (m >= 30)  return 'A whole month! Your consistency is inspiring.';
    if (m >= 14)  return 'Two weeks of hitting your goal. Your future self is already thanking you.';
    if (m >= 7)   return 'One week in a row! You are building a real habit.';
    return 'Three days down — the streak has officially started!';
  }

  dismiss(): void {
    // localStorage already written by markShown() at the point of showing;
    // dismiss just closes the sheet.
    void this.modalCtrl.dismiss();
  }

  // Called immediately before presenting the modal so that if the signal
  // re-fires (e.g. server reconciliation) before the user dismisses, a
  // second modal is not stacked on top.
  static markShown(milestone: number): void {
    localStorage.setItem(STORAGE_KEY, String(milestone));
  }

  static shouldShow(streakCurrent: number): boolean {
    const last = Number(localStorage.getItem(STORAGE_KEY) ?? 0);
    const reached = MILESTONES.filter(m => m <= streakCurrent);
    if (reached.length === 0) return false;
    return reached[reached.length - 1] > last;
  }
}
