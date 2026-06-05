import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronBackOutline } from 'ionicons/icons';
import { ReviewStore, ReviewSession } from '../../store/review.store';
import { SessionStatsService } from '../../shared/services/session-stats.service';
import { SessionDatePipe } from '../../shared/pipes/session-date.pipe';
import {
  FILTER_PERIOD_DAYS,
  FilterPeriod,
  MS_PER_DAY,
  RatingPillClass,
  SessionStats,
} from '../../models/review.model';

export type { FilterPeriod, SessionStats };

@Component({
  selector: 'lc-session-history',
  templateUrl: './session-history.page.html',
  styleUrls: ['./session-history.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonHeader, IonToolbar, IonIcon, SessionDatePipe],
})
export class SessionHistoryPage {
  private readonly reviewStore = inject(ReviewStore);
  readonly statsService = inject(SessionStatsService);
  private readonly location = inject(Location);

  constructor() {
    addIcons({ chevronBackOutline });
  }

  readonly filter = signal<FilterPeriod>(FilterPeriod.ALL);

  readonly filteredSessions = computed(() => {
    const all = this.reviewStore.sessionHistory();
    const period = this.filter();
    if (period === FilterPeriod.ALL) return all;
    const days = FILTER_PERIOD_DAYS[period];
    const cutoff = new Date(Date.now() - days * MS_PER_DAY);
    return all.filter(s => new Date(s.startedAt) >= cutoff);
  });

  setFilter(f: FilterPeriod): void {
    this.filter.set(f);
  }

  computeStats(session: ReviewSession): SessionStats {
    return this.statsService.computeStats(session);
  }

  ratingPillClass(avgRating: string): RatingPillClass {
    return this.statsService.pillClass(avgRating);
  }

  goBack(): void {
    this.location.back();
  }
}
