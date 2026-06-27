import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronBackOutline, chevronForwardOutline, lockClosedOutline } from 'ionicons/icons';
import { TranslatePipe } from '@ngx-translate/core';
import type { ConfidenceRating } from '@lingua-card/shared/domain';
import { RatingOption } from '../../../../models/review.model';

const RATING_KEY: Record<ConfidenceRating, string> = {
  1: 'review.rating.again',
  2: 'review.rating.hard',
  3: 'review.rating.good',
  4: 'review.rating.easy',
};
const RATING_CLASS: Record<ConfidenceRating, string> = {
  1: 'again',
  2: 'hard',
  3: 'good',
  4: 'easy',
};

@Component({
  selector: 'lc-rv-rating-footer',
  templateUrl: './rating-footer.component.html',
  styleUrls: ['./rating-footer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, TranslatePipe],
})
export class RatingFooterComponent {
  readonly options = input.required<RatingOption[]>();
  readonly flipped = input(false);
  readonly suggested = input<ConfidenceRating | null>(null);
  readonly canGoPrevious = input(false);

  readonly rate = output<ConfidenceRating>();
  readonly previous = output<void>();
  readonly skip = output<void>();

  readonly hasSuggested = computed(() => this.suggested() !== null);

  constructor() {
    addIcons({ chevronBackOutline, chevronForwardOutline, lockClosedOutline });
  }

  ratingKey(value: ConfidenceRating): string {
    return RATING_KEY[value];
  }
  ratingClass(value: ConfidenceRating): string {
    return RATING_CLASS[value];
  }
}
