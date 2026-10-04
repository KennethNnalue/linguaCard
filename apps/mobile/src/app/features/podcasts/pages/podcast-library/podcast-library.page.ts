import { PodcastJourneyStore } from '../../store/podcast-journey.store';
import { PodcastRecommendationSlotComponent } from '../../components/podcast-recommendation/podcast-recommendation-slot.component';
import { environment } from '../../../../../environments/environment';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonSpinner, IonToolbar } from '@ionic/angular';
import { PodcastCatalogueStore } from '../../store/podcast-catalogue.store';
import type { PodcastFeaturedEpisode } from '../../store/podcast-catalogue.store';
import { OfflineImageDirective } from '../../../../shared/image/offline-image.directive';
import { TranslatePipe } from '@ngx-translate/core';
import type { PodcastLibraryLevel } from '@lingua-card/shared/domain';

@Component({
  selector: 'lc-podcast-library', standalone: true,
  imports: [PodcastRecommendationSlotComponent, IonContent, IonHeader, IonSpinner, IonToolbar, OfflineImageDirective, TranslatePipe], providers: [PodcastCatalogueStore],
  templateUrl: './podcast-library.page.html', styleUrl: './podcast-library.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PodcastLibraryPage {
  readonly recommendationsEnabled = environment.podcastRecommendationsEnabled;
  readonly store = inject(PodcastCatalogueStore);
  readonly levels: readonly PodcastLibraryLevel[] = ['all', 'A1', 'A2', 'B1', 'B2'];
  private readonly journeys = inject(PodcastJourneyStore);
  private readonly router = inject(Router);

  resume(episodeId: string): void { void this.router.navigate(['/podcasts/episodes', episodeId, 'player']); }
  preview(episodeId: string): void { this.journeys.catalogueEntrySelected(episodeId); void this.router.navigate(['/podcasts/episodes', episodeId]); }
  ionViewWillEnter(): void { this.store.loadTopics(); }
  openTopic(topicId: string): void { void this.router.navigate(['/podcasts/topics', topicId]); }
  openFeatured(item: PodcastFeaturedEpisode): void {
    if (item.source !== 'continue' && (item.source !== 'recent' || item.completed)) this.journeys.catalogueEntrySelected(item.episode.id);
    const episodeRoute = ['/podcasts/episodes', item.episode.id];
    void this.router.navigate(item.source === 'continue' || (item.source === 'recent' && !item.completed)
      ? [...episodeRoute, 'player'] : episodeRoute);
  }
  duration(ms: number): string { return `${Math.max(1, Math.round(ms / 60000))} min`; }
}
