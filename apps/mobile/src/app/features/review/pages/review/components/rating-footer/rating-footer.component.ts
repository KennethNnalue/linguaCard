import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronBackOutline, chevronForwardOutline, lockClosedOutline } from 'ionicons/icons';
import { TranslatePipe } from '@ngx-translate/core';
import type { ReviewRating } from '@lingua-card/shared/domain';
import { RatingOption } from '../../../../models/review.model';
import {ButtonComponent} from '../../../../../../shared/ui/button/button.component';

const RATING_KEY: Record<ReviewRating, string> = {
  again: 'review.rating.again', hard: 'review.rating.hard', good: 'review.rating.good', easy: 'review.rating.easy',
};
const RATING_CLASS: Record<ReviewRating, string> = {
  again: 'again', hard: 'hard', good: 'good', easy: 'easy',
};

@Component({
  selector: 'lc-rv-rating-footer',
  templateUrl: './rating-footer.component.html',
  styleUrls: ['./rating-footer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, TranslatePipe, ButtonComponent],
})
export class RatingFooterComponent {
  readonly options = input.required<RatingOption[]>();
  readonly flipped = input(false);
  readonly suggested = input<ReviewRating | null>(null);
  readonly automatic = input(false);
  readonly canGoPrevious = input(false);
  readonly readOnly = input(false);
  readonly busy = input(false);

  readonly rate = output<ReviewRating>();
  readonly previous = output<void>();
  readonly skip = output<void>();
  readonly returnToCurrent = output<void>();

  readonly hasSuggested = computed(() => this.suggested() !== null);
  readonly alternativesVisible = signal(false);

  constructor() {
    addIcons({ chevronBackOutline, chevronForwardOutline, lockClosedOutline });
    effect(() => {
      this.suggested();
      this.alternativesVisible.set(false);
    });
  }

  ratingKey(value: ReviewRating): string {
    return RATING_KEY[value];
  }
  ratingClass(value: ReviewRating): string {
    return RATING_CLASS[value];
  }

  acceptSuggested(): void {
    const suggested = this.suggested();
    if (suggested) this.rate.emit(suggested);
  }
}
