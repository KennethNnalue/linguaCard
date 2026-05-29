import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  addCircleOutline,
  chevronForwardOutline,
  playOutline,
  informationCircleOutline,
} from 'ionicons/icons';
import { CardStore } from '../../../vault/store/card.store';
import { CollectionStore } from '../../../vault/store/collection.store';
import { ReviewStore } from '../../store/review.store';
import { ReviewFilterService } from '../../services/review-filter.service';

const MASTERY_COLOURS = ['#D1D5DB', '#FCA5A5', '#FCD34D', '#6EE7B7', '#34D399', '#059669'];
const MASTERY_LABELS = ['New', 'Beginner', 'Learning', 'Familiar', 'Good', 'Mastered'];

@Component({
  selector: 'app-review-hub',
  templateUrl: './review-hub.page.html',
  styleUrls: ['./review-hub.page.scss'],
  imports: [IonContent, IonHeader, IonToolbar, IonIcon],
})
export class ReviewHubPage {
  private readonly cardStore = inject(CardStore);
  private readonly reviewStore = inject(ReviewStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly filterService = inject(ReviewFilterService);
  private readonly router = inject(Router);

  constructor() {
    addIcons({ alertCircleOutline, addCircleOutline, chevronForwardOutline, playOutline, informationCircleOutline });
  }

  readonly dueTodayCount = computed(() => this.filterService.getDueTodayCount());

  readonly dueTodayByMastery = computed(() => this.filterService.getDueTodayByMastery());

  readonly strugglingCount = computed(() => this.filterService.getStrugglingCount());

  readonly newCount = computed(() => this.filterService.getNewCount());

  readonly recentSessions = computed(() => this.reviewStore.sessionHistory().slice(0, 2));

  readonly donutSegments = computed(() => {
    const dist = this.dueTodayByMastery();
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    if (!total) return [];

    const circumference = 2 * Math.PI * 26;
    let offset = 0;
    const segments: { colour: string; dash: number; gap: number; offset: number; label: string; count: number }[] = [];

    for (let level = 0; level <= 5; level++) {
      const count = dist[level as 0 | 1 | 2 | 3 | 4 | 5];
      if (!count) continue;
      const dash = (count / total) * circumference;
      segments.push({
        colour: MASTERY_COLOURS[level],
        dash,
        gap: circumference - dash,
        offset: -offset,
        label: MASTERY_LABELS[level],
        count,
      });
      offset += dash;
    }
    return segments;
  });

  readonly breakdownTags = computed(() => {
    const dist = this.dueTodayByMastery();
    return [
      { label: 'new', count: dist[0], colour: MASTERY_COLOURS[0] },
      { label: 'hard', count: dist[1], colour: MASTERY_COLOURS[1] },
      { label: 'learning', count: dist[2], colour: MASTERY_COLOURS[2] },
      { label: 'review', count: (dist[3] ?? 0) + (dist[4] ?? 0) + (dist[5] ?? 0), colour: MASTERY_COLOURS[3] },
    ].filter(t => t.count > 0);
  });

  startTodaysReview(): void {
    const queue = this.filterService.buildQueue({
      source: 'all',
      masteryLevels: [0, 1, 2, 3, 4, 5],
      sortOrder: 'due_date',
      limit: 50,
    });
    if (!queue.length) return;
    this.reviewStore.startSession(queue, null, null);
    void this.router.navigate(['/review/player']);
  }

  startNewOnly(): void {
    const queue = this.filterService.buildQueue({
      source: 'all',
      masteryLevels: [0],
      sortOrder: 'random',
      limit: 20,
    });
    if (!queue.length) return;
    this.reviewStore.startSession(queue, null, 'New cards');
    void this.router.navigate(['/review/player']);
  }

  goToStruggling(): void {
    void this.router.navigate(['/review/struggling']);
  }

  goToCustom(): void {
    void this.router.navigate(['/review/custom']);
  }

  goToHistory(): void {
    void this.router.navigate(['/review/history']);
  }

  goToMastery(): void {
    void this.router.navigate(['/review/mastery']);
  }

  sessionRatingColour(session: ReturnType<typeof this.recentSessions>[0]): string {
    const ratings = Object.values(session.ratings) as number[];
    if (!ratings.length) return '#6B7280';
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    if (avg >= 4.0) return '#059669';
    if (avg >= 3.0) return '#D97706';
    return '#B91C1C';
  }

  sessionAvgRating(session: ReturnType<typeof this.recentSessions>[0]): string {
    const ratings = Object.values(session.ratings) as number[];
    if (!ratings.length) return '–';
    return (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);
  }

  sessionDuration(session: ReturnType<typeof this.recentSessions>[0]): string {
    if (!session.completedAt || !session.startedAt) return '';
    const ms = new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime();
    const totalSecs = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  sessionDateLabel(session: ReturnType<typeof this.recentSessions>[0]): string {
    const date = new Date(session.startedAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays} days ago`;
  }

  sessionDotColour(session: ReturnType<typeof this.recentSessions>[0]): string {
    const ratings = Object.values(session.ratings) as number[];
    if (!ratings.length) return '#D1D5DB';
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    if (avg >= 4) return '#059669';
    if (avg >= 3) return '#6EE7B7';
    if (avg >= 2) return '#FCD34D';
    return '#FCA5A5';
  }
}
