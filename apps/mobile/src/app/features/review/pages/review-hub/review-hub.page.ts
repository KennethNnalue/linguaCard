import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
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
import { ReviewStore } from '../../store/review.store';
import { ReviewFilterService } from '../../services/review-filter.service';
import { SessionStatsService } from '../../shared/services/session-stats.service';
import { SessionDatePipe } from '../../shared/pipes/session-date.pipe';
import {
  BreakdownTag,
  BreakdownTagLabel,
  LocalReviewSession,
  MASTERY_COLOURS,
  MASTERY_LABELS,
  ReviewLimit,
  ReviewRoute,
  ReviewSortOrder,
  ReviewSource,
  RING_CIRCUMFERENCE_INNER,
  RING_CIRCUMFERENCE_OUTER,
  sessionCardIds,
} from '../../models/review.model';

@Component({
  selector: 'lc-review-hub',
  templateUrl: './review-hub.page.html',
  styleUrls: ['./review-hub.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonHeader, IonToolbar, IonIcon, SessionDatePipe],
})
export class ReviewHubPage {
  private readonly reviewStore = inject(ReviewStore);
  private readonly filterService = inject(ReviewFilterService);
  readonly stats = inject(SessionStatsService);
  private readonly router = inject(Router);

  constructor() {
    addIcons({ alertCircleOutline, addCircleOutline, chevronForwardOutline, playOutline, informationCircleOutline });
  }

  // Overdue reviews (masteryLevel > 0, nextDueAt <= now)
  readonly overdueCount = computed(() => this.filterService.getDueTodayCount());

  // New cards never reviewed (masteryLevel === 0)
  readonly newCount = computed(() => this.filterService.getNewCount());

  // Total study workload shown on the ring = overdue + new
  readonly dueTodayCount = computed(() => this.overdueCount() + this.newCount());

  readonly dueTodayByMastery = computed(() => this.filterService.getDueTodayByMastery());

  readonly strugglingCount = computed(() => this.filterService.getStrugglingCount());

  readonly recentSessions = computed(() => this.reviewStore.sessionHistory().slice(0, 2));

  // Count distinct card IDs reviewed today — prevents retried sessions from
  // inflating the count beyond the total due, which breaks ring progress math.
  readonly completedToday = computed(() => {
    const today = new Date().toISOString().split('T')[0];
    const seenIds = new Set<string>();
    for (const s of this.reviewStore.sessionHistory()) {
      if (s.completedAt?.startsWith(today)) {
        for (const id of sessionCardIds(s)) seenIds.add(id);
      }
    }
    return seenIds.size;
  });

  readonly ringOffset = computed(() => {
    const due = this.dueTodayCount();
    const done = this.completedToday();
    const total = due + done;
    if (total === 0) return RING_CIRCUMFERENCE_OUTER;
    const progress = Math.min(1, done / total);
    return RING_CIRCUMFERENCE_OUTER * (1 - progress);
  });

  readonly donutSegments = computed(() => {
    const dist = this.dueTodayByMastery();
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    if (!total) return [];

    let offset = 0;
    const segments: { colour: string; dash: number; gap: number; offset: number; label: string; count: number }[] = [];

    for (let level = 0; level <= 5; level++) {
      const count = dist[level as 0 | 1 | 2 | 3 | 4 | 5];
      if (!count) continue;
      const dash = (count / total) * RING_CIRCUMFERENCE_INNER;
      segments.push({
        colour: MASTERY_COLOURS[level as 0 | 1 | 2 | 3 | 4 | 5],
        dash,
        gap: RING_CIRCUMFERENCE_INNER - dash,
        offset: -offset,
        label: MASTERY_LABELS[level as 0 | 1 | 2 | 3 | 4 | 5],
        count,
      });
      offset += dash;
    }
    return segments;
  });

  readonly breakdownTags = computed((): BreakdownTag[] => {
    const dist = this.dueTodayByMastery();
    return [
      // New = cards never reviewed (masteryLevel 0) — counted separately from overdue
      { label: BreakdownTagLabel.NEW, count: this.newCount(), colour: MASTERY_COLOURS[0] },
      // Overdue reviewed cards broken down by mastery
      { label: BreakdownTagLabel.HARD, count: dist[1], colour: MASTERY_COLOURS[1] },
      { label: BreakdownTagLabel.LEARNING, count: dist[2], colour: MASTERY_COLOURS[2] },
      { label: BreakdownTagLabel.REVIEW, count: (dist[3] ?? 0) + (dist[4] ?? 0) + (dist[5] ?? 0), colour: MASTERY_COLOURS[3] },
    ].filter(t => t.count > 0);
  });

  startTodaysReview(): void {
    const queue = this.filterService.buildQueue({
      source: ReviewSource.ALL,
      masteryLevels: [0, 1, 2, 3, 4, 5],
      sortOrder: ReviewSortOrder.DUE_DATE,
      limit: ReviewLimit.DUE_TODAY,
    });
    if (!queue.length) return;
    this.reviewStore.startSession(queue, null, null);
    void this.router.navigate([ReviewRoute.PLAYER]);
  }

  startNewOnly(): void {
    const queue = this.filterService.buildQueue({
      source: ReviewSource.ALL,
      masteryLevels: [0],
      sortOrder: ReviewSortOrder.RANDOM,
      limit: ReviewLimit.NEW_ONLY,
    });
    if (!queue.length) return;
    this.reviewStore.startSession(queue, null, 'New cards');
    void this.router.navigate([ReviewRoute.PLAYER]);
  }

  goToStruggling(): void { void this.router.navigate([ReviewRoute.STRUGGLING]); }
  goToCustom(): void { void this.router.navigate([ReviewRoute.CUSTOM]); }
  goToHistory(): void { void this.router.navigate([ReviewRoute.HISTORY]); }
  goToMastery(): void { void this.router.navigate([ReviewRoute.MASTERY]); }

  // Thin wrappers — delegate to SessionStatsService so template bindings stay simple
  sessionRatingColour(s: LocalReviewSession): string { return this.stats.ratingColour(s); }
  sessionAvgRating(s: LocalReviewSession): string { return this.stats.avgRating(s); }
  sessionDuration(s: LocalReviewSession): string { return this.stats.formatDuration(s); }
  sessionDotColour(s: LocalReviewSession): string { return this.stats.dotColour(s); }
}
