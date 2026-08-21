import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronBackOutline } from 'ionicons/icons';
import { TranslatePipe } from '@ngx-translate/core';
import type { ReviewRating } from '@lingua-card/shared/domain';
import { ButtonComponent } from '../../../../../../shared/ui/button/button.component';
import type { RatingOption } from '../../../../models/review.model';

const RATING_KEY: Record<ReviewRating, string> = {
  again: 'review.rating.again', hard: 'review.rating.hard', good: 'review.rating.good', easy: 'review.rating.easy',
};

@Component({
  selector: 'lc-rv-rating-footer',
  templateUrl: './rating-footer.component.html',
  styleUrls: ['./rating-footer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, TranslatePipe, ButtonComponent],
})
export class RatingFooterComponent {
  readonly flipped = input(false);
  readonly selfRated = input(false);
  readonly options = input.required<RatingOption[]>();
  readonly canGoPrevious = input(false);
  readonly readOnly = input(false);
  readonly busy = input(false);

  readonly previous = output<void>();
  readonly rate = output<ReviewRating>();
  readonly continueReview = output<void>();
  readonly returnToCurrent = output<void>();

  constructor() { addIcons({ chevronBackOutline }); }

  ratingKey(value: ReviewRating): string { return RATING_KEY[value]; }

}
