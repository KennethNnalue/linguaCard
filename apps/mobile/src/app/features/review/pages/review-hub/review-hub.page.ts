import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  addCircleOutline,
  bugOutline,
  chevronForwardOutline,
  optionsOutline,
  playOutline,
  statsChartOutline,
} from 'ionicons/icons';
import { ReviewStore } from '../../store/review.store';
import { CardStore } from '../../../vault/store/card.store';
import { ReviewFilterService } from '../../services/review-filter.service';
import { LeechService } from '../../services/leech.service';
import { ReviewPrefsService, StudyMode } from '../../services/review-prefs.service';
import { SessionStatsService } from '../../shared/services/session-stats.service';
import { TranslatePipe } from '@ngx-translate/core';
import { SessionDatePipe } from '../../shared/pipes/session-date.pipe';
import { EngagementStore } from '../../../engagement/state/engagement.store';
import { SettingsStore } from '../../../settings/store/settings.store';
import {
  MINUTES_PER_CARD_REVIEW,
  ReviewSessionHistoryEntry,
  ReviewLimit,
  ReviewRoute,
} from '../../models/review.model';

interface StudyModeOption {
  value: StudyMode;
  labelKey: string;
  subKey: string;
}

@Component({
  selector: 'lc-review-hub',
  templateUrl: './review-hub.page.html',
  styleUrls: ['./review-hub.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonHeader, IonToolbar, IonIcon, SessionDatePipe, TranslatePipe],
})
export class ReviewHubPage {
  private readonly reviewStore = inject(ReviewStore);
  private readonly cardStore = inject(CardStore);
  private readonly filterService = inject(ReviewFilterService);
  private readonly leech = inject(LeechService);
  private readonly prefs = inject(ReviewPrefsService);
  private readonly engagementStore = inject(EngagementStore);
  private readonly settingsStore = inject(SettingsStore);
  readonly stats = inject(SessionStatsService);
  private readonly router = inject(Router);

  constructor() {
    addIcons({
      alertCircleOutline,
      addCircleOutline,
      bugOutline,
      chevronForwardOutline,
      optionsOutline,
      playOutline,
      statsChartOutline,
    });
  }

  readonly hasCards = computed(() => this.cardStore.cards().length > 0);

  // ─── Hero counts (all from shared selectors / facade — never re-derived) ────
  readonly overdueCount = computed(() => this.filterService.getDueTodayCount());
  readonly newCount = computed(() => this.filterService.getNewCount());
  readonly dueTodayCount = computed(() => this.overdueCount() + this.newCount());
  readonly attentionCount = computed(() => this.filterService.getStrugglingCount());
  readonly strugglingCount = this.attentionCount;
  readonly completedToday = this.engagementStore.completedToday;
  readonly estMinutes = computed(() =>
    Math.max(1, Math.round((this.dueTodayCount() * MINUTES_PER_CARD_REVIEW))),
  );

  // ─── Mastery snapshot ───────────────────────────────────────────────────────
  readonly masteredCount = this.cardStore.masteredCount;
  readonly totalCount = this.cardStore.totalCount;
  readonly masteryPct = computed(() => {
    const total = this.totalCount();
    return total ? Math.round((this.masteredCount() / total) * 100) : 0;
  });

  // ─── Leeches ────────────────────────────────────────────────────────────────
  readonly leechCount = this.leech.leechCount;

  // ─── Study mode ─────────────────────────────────────────────────────────────
  readonly studyMode = this.prefs.mode;
  readonly studyModes: StudyModeOption[] = [
    { value: 'flip', labelKey: 'review.mode.flip', subKey: 'review.mode.flipSub' },
    { value: 'type', labelKey: 'review.mode.type', subKey: 'review.mode.typeSub' },
  ];
  selectMode(mode: StudyMode): void {
    this.prefs.setMode(mode);
  }

  readonly recentSessions = computed(() => this.reviewStore.sessionHistory().slice(0, 2));

  // Ring geometry. Hero ring r=28 (c≈175.93), mastery ring r=24 (c≈150.80).
  private readonly heroCirc = 2 * Math.PI * 28;
  private readonly masteryCirc = 2 * Math.PI * 24;

  // Hero ring: how much of today's workload is done.
  readonly heroRingOffset = computed(() => {
    const due = this.dueTodayCount();
    const done = this.completedToday();
    const total = due + done;
    const progress = total === 0 ? 0 : Math.min(1, done / total);
    return this.heroCirc * (1 - progress);
  });
  readonly heroCircumference = this.heroCirc;

  readonly masteryRingOffset = computed(() => this.masteryCirc * (1 - this.masteryPct() / 100));
  readonly masteryCircumference = this.masteryCirc;

  // ─── Navigation / actions ───────────────────────────────────────────────────
  startTodaysReview(): void {
    const dailyGoal = this.settingsStore.dailyGoal();
    void this.reviewStore.startSession({ kind: 'daily' }, dailyGoal).then(result => {
      if (result.kind === 'started') void this.router.navigate([ReviewRoute.PLAYER]);
    });
  }

  startNewOnly(): void {
    void this.reviewStore.startSession({ kind: 'new-only' }, ReviewLimit.NEW_ONLY).then(result => {
      if (result.kind === 'started') void this.router.navigate([ReviewRoute.PLAYER]);
    });
  }

  goToStruggling(): void { void this.router.navigate([ReviewRoute.STRUGGLING]); }
  goToCustom(): void { void this.router.navigate([ReviewRoute.CUSTOM]); }
  goToHistory(): void { void this.router.navigate([ReviewRoute.HISTORY]); }
  goToMastery(): void { void this.router.navigate([ReviewRoute.MASTERY]); }
  goToLeeches(): void { void this.router.navigate([ReviewRoute.LEECHES]); }
  navigateTo(path: string): void { void this.router.navigateByUrl(path); }

  sessionNailed(s: ReviewSessionHistoryEntry): number { return this.stats.nailed(s); }
  sessionStruggled(s: ReviewSessionHistoryEntry): number { return this.stats.struggled(s); }
  sessionDuration(s: ReviewSessionHistoryEntry): string { return this.stats.formatDuration(s); }
  sessionDotColour(s: ReviewSessionHistoryEntry): string { return this.stats.dotColour(s); }
}
