import {ChangeDetectionStrategy, Component, computed, input, output} from '@angular/core';
import {IonIcon} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {volumeHighOutline} from 'ionicons/icons';
import {Card} from '@lingua-card/shared/domain';
import {ArticleBadgeComponent} from '../../components/article-badge/article-badge.component';
import {MasteryDotComponent} from '../../components/mastery-dot/mastery-dot.component';

@Component({
  selector: 'lc-word-card',
  templateUrl: './word-card.component.html',
  styleUrls: ['./word-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ArticleBadgeComponent, MasteryDotComponent, IonIcon],
})
export class WordCardComponent {
  readonly card = input.required<Card>();
  readonly categoryName = input<string>('');
  readonly compact = input<boolean>(false);

  readonly cardClick = output<void>();
  readonly playAudio = output<void>();

  constructor() {
    addIcons({volumeHighOutline});
  }

  readonly masteryLevel = computed(() => this.card().srsState?.masteryLevel ?? 0);

  readonly masteryColor = computed(() =>
    ['#D1D5DB', '#FCA5A5', '#FCD34D', '#6EE7B7', '#34D399', '#059669'][this.masteryLevel()]
  );

  readonly masteryLabel = computed(() => {
    const state = this.card().srsState?.state;
    if (!state || state === 'new') return 'New';
    return {learning: 'Learning', review: 'Review', mastered: 'Mastered'}[state] ?? 'New';
  });

  readonly isDue = computed(() => {
    const next = this.card().srsState?.nextDueAt;
    return !next || new Date(next).getTime() <= Date.now();
  });

  readonly intervalText = computed(() => {
    const days = this.card().srsState?.intervalDays ?? 0;
    return days > 0 ? `${days}d interval` : '';
  });

  readonly firstExample = computed(() => this.card().content.examples?.[0] ?? null);

  readonly highlightedExample = computed(() => {
    const ex = this.firstExample();
    if (!ex) return '';
    const word = this.card().content.back;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return ex.target.replace(new RegExp(`(${escaped})`, 'gi'), '<strong>$1</strong>');
  });

  onPlayAudio(event: Event): void {
    event.stopPropagation();
    this.playAudio.emit();
  }
}
