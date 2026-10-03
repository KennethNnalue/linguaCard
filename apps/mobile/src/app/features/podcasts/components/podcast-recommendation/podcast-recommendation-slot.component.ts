import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import type { PodcastLibraryLevel, PodcastRecommendationPlacement } from '@lingua-card/shared/domain';
import { PodcastRecommendationsStore } from '../../store/podcast-recommendations.store';
import { PodcastDiscoveryEventsService } from '../../services/podcast-discovery-events.service';
import { PodcastRecommendationComponent } from './podcast-recommendation.component';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'lc-podcast-recommendation-slot', standalone: true, imports: [PodcastRecommendationComponent],
  providers: [PodcastRecommendationsStore], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (store.recommendation(); as item) {
    <lc-podcast-recommendation [recommendation]="item" [evidence]="store.response()?.evidence ?? 'unavailable'"
      (visible)="recordImpression()" (play)="open(false)" (preview)="open(true)" />
  }`,
})
export class PodcastRecommendationSlotComponent {
  readonly placement = input.required<PodcastRecommendationPlacement>();
  readonly level = input<PodcastLibraryLevel>('all'); readonly sessionId = input<string>();
  readonly store = inject(PodcastRecommendationsStore);
  private readonly router = inject(Router); private readonly events = inject(PodcastDiscoveryEventsService);
  private readonly auth = inject(AuthService);
  constructor() {
    effect(() => { this.events.revision(); this.auth.currentUser()?.id; void this.store.load(this.placement(), this.level(), this.sessionId()); });
  }
  refresh(): void { void this.store.load(this.placement(), this.level(), this.sessionId()); }
  recordImpression(): void {
    const item = this.store.recommendation(); if (!item) return;
    this.events.record({ name: 'recommendation_impression', episodeId: item.episode.id, placement: this.placement(), recommendationId: item.id, policyVersion: item.policyVersion });
  }
  open(preview: boolean): void {
    const item = this.store.recommendation(); if (!item) return;
    this.events.record({ name: preview ? 'preview_opened' : 'recommendation_selected', episodeId: item.episode.id,
      placement: this.placement(), recommendationId: item.id, policyVersion: item.policyVersion });
    void this.router.navigate(['/podcasts/episodes', item.episode.id, ...(preview ? [] : ['player'])],
      { queryParams: preview ? {} : { autoplay: '1' } });
  }
}
