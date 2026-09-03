import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonItem, IonLabel, IonList, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, chevronForwardOutline, play, repeatOutline, shuffleOutline } from 'ionicons/icons';
import { PodcastCatalogueStore } from '../../store/podcast-catalogue.store';
import { shufflePodcastEpisodeIds } from '../../domain/podcast-playback-queue';
import { OfflineImageDirective } from '../../../../shared/image/offline-image.directive';

@Component({
  selector: 'lc-podcast-topic', standalone: true,
  imports: [IonButton, IonContent, IonIcon, IonItem, IonLabel, IonList, IonSpinner, OfflineImageDirective],
  providers: [PodcastCatalogueStore], templateUrl: './podcast-topic.page.html',
  styleUrl: './podcast-topic.page.scss', changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PodcastTopicPage implements OnInit {
  readonly store = inject(PodcastCatalogueStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  constructor() {
    addIcons({ arrowBackOutline, chevronForwardOutline, play, repeatOutline, shuffleOutline });
  }
  ngOnInit(): void { this.store.loadTopic(this.route.snapshot.paramMap.get('topicId') ?? ''); }
  goBack(): void { void this.router.navigate(['/podcasts']); }
  openEpisode(id: string): void { void this.router.navigate(['/podcasts/episodes', id]); }
  playTopic(repeat = false): void {
    const episodeIds = this.store.topic()?.episodes.map(episode => episode.id) ?? [];
    this.startQueue(episodeIds, repeat);
  }
  shuffleTopic(): void {
    const episodeIds = this.store.topic()?.episodes.map(episode => episode.id) ?? [];
    this.startQueue(shufflePodcastEpisodeIds(episodeIds), false);
  }
  duration(ms: number): string { return `${Math.max(1, Math.round(ms / 60000))} min`; }

  private startQueue(episodeIds: readonly string[], repeat: boolean): void {
    const firstEpisodeId = episodeIds[0];
    if (!firstEpisodeId) return;
    void this.router.navigate(['/podcasts/episodes', firstEpisodeId, 'player'], {
      queryParams: {
        scope: 'topic',
        autoplay: '1',
        queue: episodeIds.join(','),
        ...(repeat ? { repeat: 'topic' } : {}),
      },
    });
  }
}
