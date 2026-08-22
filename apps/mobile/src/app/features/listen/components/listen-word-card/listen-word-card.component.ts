import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ArticleBadgeComponent } from '../../../../shared/components/article-badge/article-badge.component';
import { VocabularyPlaylistItem } from '../../models/listen.models';

/** The hero word card on the Now Playing screen. */
@Component({
  selector: 'lc-listen-word-card',
  templateUrl: './listen-word-card.component.html',
  styleUrl: './listen-word-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ArticleBadgeComponent],
  host: {
    '[class.article-der]': "card()?.article === 'der'",
    '[class.article-die]': "card()?.article === 'die'",
    '[class.article-das]': "card()?.article === 'das'",
  },
})
export class ListenWordCardComponent {
  readonly card = input.required<VocabularyPlaylistItem | null>();
}
