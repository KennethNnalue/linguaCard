import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import {ReviewPlayerService} from '../../services/review-player.service';
import {ReviewFilterService} from '../../services/review-filter.service';
import {ReviewRoute} from '../../models/review.model';
import {WordRowComponent} from '../../../vault/components/word-row/word-row.component';
import {DEFAULT_PLAYLIST_LANGUAGES, ListenSourceLabel, toVocabularyPlaylistItem} from '../../../listen/models/listen.models';
import {VocabularyPlayerService} from '../../../listen/services/vocabulary-player.service';
import {isDue} from '../../domain/review-status';

@Component({
  selector: 'lc-struggling-cards',
  templateUrl: './struggling-cards.page.html',
  styleUrl: './struggling-cards.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, WordRowComponent, TranslatePipe],
})
export class StrugglingCardsPage {
  private readonly filterService = inject(ReviewFilterService);
  private readonly reviewPlayer = inject(ReviewPlayerService);
  private readonly vocabularyPlayer = inject(VocabularyPlayerService);
  private readonly router = inject(Router);

  readonly strugglingCards = computed(() => this.filterService.getStrugglingCards());
  readonly totalFailures = computed(() => this.strugglingCards()
    .reduce((total, card) => total + card.reviewState.totalAgainCount, 0));
  readonly dueCount = computed(() => this.strugglingCards().filter(card => isDue(card, new Date())).length);

  startReview(): void {
    const queue = this.strugglingCards();
    if (!queue.length) return;
    void this.reviewPlayer.open(queue, { kind: 'struggling' });
  }

  startListen(): void {
    const queue = this.strugglingCards();
    if (!queue.length) return;
    void this.vocabularyPlayer.open({
      playlistId: 'struggling',
      title: ListenSourceLabel.Struggling,
      source: { kind: 'struggling' },
      languages: DEFAULT_PLAYLIST_LANGUAGES,
      items: queue.map(toVocabularyPlaylistItem),
    });
  }

  openWordDetail(card: { id: string }): void {
    void this.router.navigate(['/vault', card.id]);
  }

  goBack(): void {
    void this.router.navigate([ReviewRoute.HUB]);
  }
}
