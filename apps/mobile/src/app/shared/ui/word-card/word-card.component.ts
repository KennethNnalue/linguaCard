import {ChangeDetectionStrategy, Component, computed, inject, input, output} from '@angular/core';
import {IonIcon} from '@ionic/angular/standalone';
import {TranslateService} from '@ngx-translate/core';
import {addIcons} from 'ionicons';
import {volumeHighOutline} from 'ionicons/icons';
import {ScheduledCard} from '@lingua-card/shared/domain';
import {LanguageService} from '../../../core/services/language.service';
import {ArticleBadgeComponent} from '../../components/article-badge/article-badge.component';
import {MasteryDotComponent} from '../../components/mastery-dot/mastery-dot.component';
import type {AudioReadinessStatus} from '../../audio/audio-readiness.store';
import { isDue, stageIndicator } from '../../../features/review/domain/review-status';
import { MASTERY_LABEL_KEYS } from '../../../features/review/models/review.model';

@Component({
  selector: 'lc-word-card',
  templateUrl: './word-card.component.html',
  styleUrls: ['./word-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ArticleBadgeComponent, MasteryDotComponent, IonIcon],
})
export class WordCardComponent {
  readonly card = input.required<ScheduledCard>();
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

  readonly masteryLevel = computed(() => stageIndicator(this.card().reviewState.stage));

  readonly masteryColor = computed(() =>
    ['#D1D5DB', '#FCA5A5', '#FCD34D', '#6EE7B7', '#34D399', '#059669'][this.masteryLevel()]
  );

  readonly masteryLabel = computed(() => {
    this.languageService.current(); // recompute on UI language change
    return this.translate.instant(MASTERY_LABEL_KEYS[this.card().reviewState.stage]);
  });

  readonly isDue = computed(() => {
    return isDue(this.card(), new Date());
  });

  readonly intervalText = computed(() => {
    const minutes = this.card().reviewState.intervalMinutes ?? 0;
    return minutes > 0 ? `${Math.round(minutes / 1_440)}d interval` : '';
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
