import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBack, arrowForward, play } from 'ionicons/icons';
import { PodcastCatalogueStore } from '../../store/podcast-catalogue.store';

@Component({
  selector: 'lc-podcast-library', standalone: true,
  imports: [IonButton, IonContent, IonHeader, IonIcon, IonToolbar], providers: [PodcastCatalogueStore],
  templateUrl: './podcast-library.page.html', styleUrl: './podcast-library.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PodcastLibraryPage implements OnInit {
  readonly store = inject(PodcastCatalogueStore);
  private readonly router = inject(Router);

  constructor() { addIcons({ arrowBack, arrowForward, play }); }

  ngOnInit(): void { this.store.loadTopics(); }
  openTopic(topicId: string): void { void this.router.navigate(['/podcasts/topics', topicId]); }
  continueEpisode(episodeId: string): void {
    void this.router.navigate(['/podcasts/episodes', episodeId, 'player']);
  }
  openActivity(episodeId: string, completed: boolean): void {
    void this.router.navigate(completed
      ? ['/podcasts/episodes', episodeId, 'complete']
      : ['/podcasts/episodes', episodeId, 'player']);
  }
  goBack(): void { void this.router.navigate(['/listen']); }
  duration(ms: number): string { return `${Math.max(1, Math.round(ms / 60000))} min`; }
}
