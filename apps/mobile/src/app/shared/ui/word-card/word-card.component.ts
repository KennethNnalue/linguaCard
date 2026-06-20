import {ChangeDetectionStrategy, Component, computed, inject, input, output} from '@angular/core';
import {IonIcon} from '@ionic/angular/standalone';
import {TranslateService} from '@ngx-translate/core';
import {addIcons} from 'ionicons';
import {volumeHighOutline} from 'ionicons/icons';
import {Card} from '@lingua-card/shared/domain';
import {LanguageService} from '../../../core/services/language.service';
import {ArticleBadgeComponent} from '../../components/article-badge/article-badge.component';
import {MasteryDotComponent} from '../../components/mastery-dot/mastery-dot.component';
import type {AudioReadinessStatus} from '../../audio/audio-readiness.store';

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
  readonly audioStatus = input<AudioReadinessStatus | 'unknown'>('unknown');

  readonly cardClick = output<void>();
  readonly playAudio = output<void>();
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);

  constructor() {
    addIcons({volumeHighOutline});
  }

  readonly masteryLevel = computed(() => this.card().srsState?.masteryLevel ?? 0);

  readonly masteryColor = computed(() =>
    ['#D1D5DB', '#FCA5A5', '#FCD34D', '#6EE7B7', '#34D399', '#059669'][this.masteryLevel()]
  );

  readonly masteryLabel = computed(() => {
    this.languageService.current(); // recompute on UI language change
    const state = this.card().srsState?.state;
    if (!state || state === 'new') return this.translate.instant('srs.masteryLabel.new');
    const key = {learning: 'srs.masteryLabel.learning', review: 'srs.masteryLabel.review', relearning: 'srs.masteryLabel.review', mastered: 'srs.masteryLabel.mastered'}[state];
    return key ? this.translate.instant(key) : this.translate.instant('srs.masteryLabel.new');
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
