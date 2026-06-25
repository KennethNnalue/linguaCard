import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Card } from '@lingua-card/shared/domain';
import { ArticleBadgeComponent } from '../../../../shared/components/article-badge/article-badge.component';

/** The hero word card on the Now Playing screen. */
@Component({
  selector: 'lc-listen-word-card',
  templateUrl: './listen-word-card.component.html',
  styleUrl: './listen-word-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ArticleBadgeComponent],
})
export class ListenWordCardComponent {
  readonly card = input.required<Card | null>();
  readonly index = input.required<number>();
  readonly total = input.required<number>();
}
