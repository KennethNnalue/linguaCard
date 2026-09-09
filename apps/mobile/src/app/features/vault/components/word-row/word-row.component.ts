import {ChangeDetectionStrategy, Component, computed, inject, input, output} from '@angular/core';
import {IonButton, IonIcon} from '@ionic/angular/standalone';
import {TranslatePipe, TranslateService} from '@ngx-translate/core';
import {addIcons} from 'ionicons';
import {volumeHighOutline} from 'ionicons/icons';
import {ScheduledCard} from '@lingua-card/shared/domain';
import {LanguageService} from '../../../../core/services/language.service';
import {ArticleBadgeComponent} from '../../../../shared/components/article-badge/article-badge.component';
import { isDue, stageIndicator } from '../../../review/domain/review-status';
import { MASTERY_LABEL_KEYS } from '../../../review/models/review.model';

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
  imports: [ArticleBadgeComponent, IonButton, IonIcon, TranslatePipe],
})
export class WordRowComponent {
  readonly card = input.required<ScheduledCard>();
  readonly showAudio = input(false);
  readonly rowClick = output<void>();
  readonly playAudio = output<void>();

  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);

  constructor() {
    addIcons({volumeHighOutline});
  }

  readonly masteryLevel = computed(() => stageIndicator(this.card().reviewState.stage));

  readonly masteryColor = computed(() => `var(--lc-mastery-${this.masteryLevel()})`);

  /** A studied card past its review date. New (never studied) cards are not "due" here. */
  readonly isDue = computed(() => {
    return isDue(this.card(), new Date());
  });

  readonly masteryLabel = computed(() => {
    this.languageService.current(); // recompute on UI language change
    return this.translate.instant(MASTERY_LABEL_KEYS[this.card().reviewState.stage]);
  });
}
