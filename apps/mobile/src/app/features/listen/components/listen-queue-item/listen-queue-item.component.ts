import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PlayMode, ScheduledCard } from '@lingua-card/shared/domain';
import { ArticleBadgeComponent } from '../../../../shared/components/article-badge/article-badge.component';
import { WordAudioService } from '../../../../shared/audio/word-audio.service';

/** A single word row in the hub queue list. */
@Component({
  selector: 'lc-listen-queue-item',
  templateUrl: './listen-queue-item.component.html',
  styleUrl: './listen-queue-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ArticleBadgeComponent, TranslatePipe],
})
export class ListenQueueItemComponent {
  private readonly wordAudio = inject(WordAudioService);

  readonly card = input.required<ScheduledCard>();
  readonly categoryLabel = input('');
  readonly playMode = input.required<PlayMode>();
  readonly preview = output<void>();

  /** True once this word's HD audio is cached (shows the "HD ready" dot). */
  readonly hdReady = computed(() => {
    const c = this.card();
    const word = c.content.article ? `${c.content.article} ${c.content.back}` : c.content.back;
    return this.wordAudio.readinessFor(word, 'de-DE') === 'ready';
  });
}
