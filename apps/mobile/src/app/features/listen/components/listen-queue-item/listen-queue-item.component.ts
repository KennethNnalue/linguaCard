import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ArticleBadgeComponent } from '../../../../shared/components/article-badge/article-badge.component';
import { VocabularyPlaylistItem } from '../../models/listen.models';

@Component({
  selector: 'lc-listen-queue-item',
  templateUrl: './listen-queue-item.component.html',
  styleUrl: './listen-queue-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ArticleBadgeComponent, TranslatePipe],
})
export class ListenQueueItemComponent {
  readonly item = input.required<VocabularyPlaylistItem>();
  readonly position = input.required<number>();
  readonly preview = output<void>();
}
