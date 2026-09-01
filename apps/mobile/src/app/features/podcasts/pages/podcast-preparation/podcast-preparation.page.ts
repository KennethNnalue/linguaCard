import { ChangeDetectionStrategy, Component, ElementRef, inject, OnInit, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, libraryOutline, play, schoolOutline } from 'ionicons/icons';
import { ReviewPlayerService } from '../../../review/services/review-player.service';
import { PodcastCatalogueStore } from '../../store/podcast-catalogue.store';

@Component({
  selector: 'lc-podcast-preparation', standalone: true,
  imports: [IonButton, IonContent, IonIcon, IonSpinner],
  providers: [PodcastCatalogueStore], templateUrl: './podcast-preparation.page.html',
  styleUrls: ['./podcast-preparation.page.scss', './podcast-preparation-actions.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PodcastPreparationPage implements OnInit {
  readonly store = inject(PodcastCatalogueStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly reviewPlayer = inject(ReviewPlayerService);
  private readonly wordList = viewChild<ElementRef<HTMLElement>>('wordList');
  constructor() {
    addIcons({ arrowBackOutline, libraryOutline, play, schoolOutline });
  }
  ngOnInit(): void { this.store.loadPreparation(this.route.snapshot.paramMap.get('episodeId') ?? ''); }
  goBack(topicId: string): void { void this.router.navigate(['/podcasts/topics', topicId]); }
  listenNow(): void {
    const episodeId = this.store.preparation()?.episode.id;
    if (episodeId) void this.router.navigate(['/podcasts/episodes', episodeId, 'player'], {
      queryParams: { autoplay: '1' },
    });
  }
  async reviewWords(): Promise<void> {
    const preparation = this.store.preparation();
    if (!preparation?.readiness.learnFirstCount) {
      this.wordList()?.nativeElement.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const collectionId = await this.store.prepareSuggestedVocabulary(preparation.episode.id);
    if (!collectionId) return;
    await this.reviewPlayer.openSource(
      { kind: 'collection', collectionId }, preparation.readiness.learnFirstCount,
    );
  }
  prepareWords(episodeId: string): void { void this.store.prepareSuggestedVocabulary(episodeId); }
  openPreparedCollection(): void {
    const collectionId = this.store.preparationCollectionId();
    if (collectionId) void this.router.navigate(['/vault/collections', collectionId]);
  }
}
