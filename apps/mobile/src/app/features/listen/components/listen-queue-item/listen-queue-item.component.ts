import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Card, PlayMode } from '@lingua-card/shared/domain';
import { ArticleBadgeComponent } from '../../../../shared/components/article-badge/article-badge.component';

/** A single word row in the hub queue list. */
@Component({
  selector: 'lc-listen-queue-item',
  templateUrl: './listen-queue-item.component.html',
  styleUrl: './listen-queue-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ArticleBadgeComponent, TranslatePipe],
})
export class ListenQueueItemComponent {
  readonly card = input.required<Card>();
  readonly categoryLabel = input('');
  readonly playMode = input.required<PlayMode>();
  readonly preview = output<void>();
}
