import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronBackOutline } from 'ionicons/icons';
import { ReviewStore, ReviewSession } from '../../store/review.store';

type FilterPeriod = 'all' | 'week' | 'month';

export interface SessionStats {
  totalCards: number;
  duration: string;
  avgRating: string;
  struggled: number;
  nailed: number;
}

@Component({
  selector: 'lc-session-history',
  templateUrl: './session-history.page.html',
  styleUrls: ['./session-history.page.scss'],
  imports: [IonContent, IonHeader, IonToolbar, IonIcon],
})
export class SessionHistoryPage {
  private readonly reviewStore = inject(ReviewStore);
  private readonly router = inject(Router);

  constructor() {
    addIcons({ chevronBackOutline });
  }

  readonly filter = signal<FilterPeriod>('all');

  readonly filteredSessions = computed(() => {
    const all = this.reviewStore.sessionHistory();
    const period = this.filter();
    if (period === 'all') return all;
    const now = new Date();
    const cutoff = period === 'week'
      ? new Date(now.getTime() - 7 * 86400000)
      : new Date(now.getTime() - 30 * 86400000);
    return all.filter(s => new Date(s.startedAt) >= cutoff);
  });

  setFilter(f: FilterPeriod): void {
    this.filter.set(f);
  }

  computeStats(session: ReviewSession): SessionStats {
    const ratings = Object.values(session.ratings) as number[];
    const avg = ratings.length
      ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
      : '–';

    const ms = session.completedAt
      ? new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()
      : 0;
    const totalSecs = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    const duration = m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;

    return {
      totalCards: session.totalCards,
      duration,
      avgRating: avg,
      struggled: ratings.filter(r => r <= 2).length,
      nailed: ratings.filter(r => r === 5).length,
    };
  }

  ratingPillClass(avgRating: string): string {
    const n = parseFloat(avgRating);
    if (isNaN(n)) return 'pill--neutral';
    if (n >= 4.0) return 'pill--green';
    if (n >= 3.0) return 'pill--amber';
    return 'pill--red';
  }

  dateLabel(session: ReviewSession): string {
    const date = new Date(session.startedAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 0) return `Today, ${timeStr}`;
    if (diffDays === 1) return `Yesterday, ${timeStr}`;
    return `${diffDays} days ago, ${timeStr}`;
  }

  goBack(): void {
    void this.router.navigate(['/review']);
  }
}
