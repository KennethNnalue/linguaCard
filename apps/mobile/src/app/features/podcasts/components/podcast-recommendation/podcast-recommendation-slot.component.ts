import { PodcastJourneyStore } from '../../store/podcast-journey.store';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { IonButton } from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { Router } from '@angular/router';
import type { PodcastRecommendation, PodcastLibraryLevel, PodcastRecommendationPlacement } from '@lingua-card/shared/domain';
import { PodcastRecommendationsStore } from '../../store/podcast-recommendations.store';
import { PodcastDiscoveryEventsService } from '../../services/podcast-discovery-events.service';
import { PodcastRecommendationComponent } from './podcast-recommendation.component';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'lc-podcast-recommendation-slot', standalone: true, imports: [PodcastRecommendationComponent, IonButton, TranslatePipe],
  providers: [PodcastRecommendationsStore], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (items().length && placement() === 'library') { <h2>{{ 'podcasts.discovery.heading' | translate }}</h2> }
  @for (item of items(); track item.id) {
    <lc-podcast-recommendation [recommendation]="item" [evidence]="store.response()?.evidence ?? 'unavailable'"
      (visible)="recordImpression(item)" (listenSelected)="open(item, false)" (preview)="open(item, true)" />
  }
  @if (placement() === 'library' && (store.response()?.recommendations?.length ?? 0) > 1) {
    <ion-button fill="clear" (click)="expanded.set(!expanded())" [attr.aria-expanded]="expanded()">{{ (expanded() ? 'podcasts.discovery.showLess' : 'podcasts.discovery.showMore') | translate }}</ion-button>
  }`,
})
export class PodcastRecommendationSlotComponent {
  readonly placement = input.required<PodcastRecommendationPlacement>();
  readonly level = input<PodcastLibraryLevel>('all'); readonly sessionId = input<string>();
  readonly store = inject(PodcastRecommendationsStore);
  readonly expanded = signal(false);
  readonly items = computed(() => (this.store.response()?.recommendations ?? []).slice(0, this.expanded() ? 10 : 1));
  private readonly journeys = inject(PodcastJourneyStore);
  private readonly router = inject(Router); private readonly events = inject(PodcastDiscoveryEventsService);
  private readonly auth = inject(AuthService);
  constructor() {
    effect(() => { this.events.revision(); this.auth.currentUser(); void this.store.load(this.placement(), this.level(), this.sessionId()); });
  }
  refresh(): void { void this.store.load(this.placement(), this.level(), this.sessionId()); }
  recordImpression(item: PodcastRecommendation): void {
    this.events.record({ name: 'recommendation_impression', episodeId: item.episode.id, placement: this.placement(), recommendationId: item.id, policyVersion: item.policyVersion });
  }
  async open(item: PodcastRecommendation, preview: boolean): Promise<void> {
    await this.journeys.select(item, preview);
    void this.router.navigate(['/podcasts/episodes', item.episode.id, ...(preview ? [] : ['player'])],
      { queryParams: preview ? { preview: 'words' } : { autoplay: '1' } });
  }
}
