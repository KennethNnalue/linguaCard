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
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SessionDatePipe } from '../../shared/pipes/session-date.pipe';
import { EngagementStore } from '../../../engagement/state/engagement.store';
import { SettingsStore } from '../../../settings/store/settings.store';
import {ReviewSessionHistoryEntry, ReviewRoute} from '../../models/review.model';
import {ReviewHubPresentationStore} from '../../store/review-hub-presentation.store';
import {ButtonComponent} from '../../../../shared/ui/button/button.component';
import {BottomSheetService} from '../../../../shared/components/bottom-sheet/bottom-sheet.service';
import type {ReviewAutoplayMode} from '../../application/review-audio-policy';
import { ReviewPlayerService } from '../../services/review-player.service';
import { isNew } from '../../domain/review-status';

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
  imports: [IonContent, IonHeader, IonToolbar, IonIcon, SessionDatePipe, TranslatePipe, ButtonComponent],
})
export class ReviewHubPage {
  private readonly reviewStore = inject(ReviewStore);
  private readonly reviewPlayer = inject(ReviewPlayerService);
  private readonly cardStore = inject(CardStore);
  private readonly filterService = inject(ReviewFilterService);
  private readonly leech = inject(LeechService);
  private readonly prefs = inject(ReviewPrefsService);
  private readonly engagementStore = inject(EngagementStore);
  private readonly settingsStore = inject(SettingsStore);
  readonly stats = inject(SessionStatsService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly bottomSheet = inject(BottomSheetService);
  readonly presentation = inject(ReviewHubPresentationStore);

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

  async changeMode(): Promise<void> {
    await this.bottomSheet.open(this.translate.instant('review.mode.section'), [
      {
        label: this.translate.instant('review.mode.type'),
        handler: () => this.presentation.selectMode('type'),
      },
      {
        label: this.translate.instant('review.mode.flip'),
        handler: () => this.presentation.selectMode('flip'),
      },
      {label: this.translate.instant('common.cancel'), role: 'cancel'},
    ]);
  }

  readonly autoplay = this.prefs.autoplay;

  autoplayLabelKey(): string {
    return `review.audioAutoplay.${this.autoplay()}`;
  }

  async changeAutoplay(): Promise<void> {
    const option = (mode: ReviewAutoplayMode) => ({
      label: this.translate.instant(`review.audioAutoplay.${mode}`),
      handler: () => this.prefs.setAutoplay(mode),
    });
    await this.bottomSheet.open(this.translate.instant('review.audioAutoplay.title'), [
      option('off'),
      option('answer'),
      option('answer_and_example'),
      {label: this.translate.instant('common.cancel'), role: 'cancel'},
    ]);
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
    const resumableSessionId = this.reviewStore.resumableSessionId();
    if (resumableSessionId) {
      void this.reviewPlayer.resume(resumableSessionId);
      return;
    }
    const dailyGoal = this.settingsStore.dailyGoal();
    void this.reviewPlayer.openSource({ kind: 'daily' }, dailyGoal);
  }

  performPrimaryAction(): void {
    const hero = this.presentation.hero();
    if (hero.kind === 'empty') {
      void this.router.navigate(['/vault']);
      return;
    }
    if (hero.kind === 'caught-up') {
      if (hero.newAvailable > 0) this.startNewOnly();
      else void this.router.navigate(['/vault']);
      return;
    }
    this.startTodaysReview();
  }

  startNewOnly(): void {
    const cards = this.cardStore.cards().filter(isNew);
    void this.reviewPlayer.open(cards, { kind: 'new-only' });
  }

  goToStruggling(): void { void this.router.navigate([ReviewRoute.STRUGGLING]); }
  goToCustom(): void { void this.router.navigate([ReviewRoute.CUSTOM]); }
  goToHistory(): void { void this.router.navigate([ReviewRoute.HISTORY]); }
  goToProgress(): void { void this.router.navigate([ReviewRoute.PROGRESS]); }
  goToMastery(): void { void this.router.navigate([ReviewRoute.MASTERY]); }
  goToLeeches(): void { void this.router.navigate([ReviewRoute.LEECHES]); }
  navigateTo(path: string): void { void this.router.navigateByUrl(path); }

  sessionNailed(s: ReviewSessionHistoryEntry): number { return this.stats.nailed(s); }
  sessionStruggled(s: ReviewSessionHistoryEntry): number { return this.stats.struggled(s); }
  sessionDuration(s: ReviewSessionHistoryEntry): string { return this.stats.formatDuration(s); }
  sessionDotColour(s: ReviewSessionHistoryEntry): string { return this.stats.dotColour(s); }
}
