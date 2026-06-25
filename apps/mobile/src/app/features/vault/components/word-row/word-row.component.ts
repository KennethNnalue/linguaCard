import {ChangeDetectionStrategy, Component, computed, inject, input, output} from '@angular/core';
import {TranslatePipe, TranslateService} from '@ngx-translate/core';
import {Card} from '@lingua-card/shared/domain';
import {LanguageService} from '../../../../core/services/language.service';
import {ArticleBadgeComponent} from '../../../../shared/components/article-badge/article-badge.component';

/**
 * Lexicon word row — the premium list item shared by the Word Index and the
 * Collection Detail. Mastery left-strip + article badge + serif headword +
 * translation, trailing DUE pill (studied & due) or mastery label.
 */
@Component({
  selector: 'lc-word-row',
  templateUrl: './word-row.component.html',
  styleUrls: ['./word-row.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ArticleBadgeComponent, TranslatePipe],
})
export class WordRowComponent {
  readonly card = input.required<Card>();
  readonly rowClick = output<void>();

  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);

  readonly masteryLevel = computed(() => this.card().srsState?.masteryLevel ?? 0);

  readonly masteryColor = computed(() => `var(--lc-mastery-${this.masteryLevel()})`);

  /** A studied card past its review date. New (never studied) cards are not "due" here. */
  readonly isDue = computed(() => {
    const srs = this.card().srsState;
    if (!srs) return false;
    const next = srs.nextDueAt;
    return !next || new Date(next).getTime() <= Date.now();
  });

  readonly masteryLabel = computed(() => {
    this.languageService.current(); // recompute on UI language change
    const state = this.card().srsState?.state;
    if (!state || state === 'new') return this.translate.instant('srs.masteryLabel.new');
    const key = {
      learning: 'srs.masteryLabel.learning',
      review: 'srs.masteryLabel.review',
      relearning: 'srs.masteryLabel.review',
      mastered: 'srs.masteryLabel.mastered',
    }[state];
    return this.translate.instant(key ?? 'srs.masteryLabel.new');
  });
}
