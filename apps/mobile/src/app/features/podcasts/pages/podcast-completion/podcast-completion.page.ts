import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowForward, checkmark, refresh } from 'ionicons/icons';
import { PodcastCatalogueStore } from '../../store/podcast-catalogue.store';

@Component({
  selector: 'lc-podcast-completion', standalone: true, imports: [IonButton, IonContent, IonIcon],
  providers: [PodcastCatalogueStore], templateUrl: './podcast-completion.page.html',
  styleUrl: './podcast-completion.page.scss', changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PodcastCompletionPage implements OnInit {
  readonly store = inject(PodcastCatalogueStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  constructor() { addIcons({ arrowForward, checkmark, refresh }); }

  ngOnInit(): void {
    this.store.loadCompletion(this.route.snapshot.paramMap.get('episodeId') ?? '');
  }

  replay(episodeId: string): void {
    void this.router.navigate(['/podcasts/episodes', episodeId, 'player'], {
      queryParams: { autoplay: '1' },
    });
  }

  openNext(episodeId: string): void {
    void this.router.navigate(['/podcasts/episodes', episodeId]);
  }

  openTopic(topicId: string): void {
    void this.router.navigate(['/podcasts/topics', topicId]);
  }
}
