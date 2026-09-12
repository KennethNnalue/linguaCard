import {ChangeDetectionStrategy, Component, computed, input, output} from '@angular/core';
import {IonIcon, IonItem, IonLabel} from '@ionic/angular';
import {TranslatePipe} from '@ngx-translate/core';
import {addIcons} from 'ionicons';
import {
  bookOutline,
  chevronForwardOutline,
  flameOutline,
  settingsOutline,
  statsChartOutline,
} from 'ionicons/icons';
import type {ReviewHomeDashboard} from '../../models/review-home.model';

@Component({
  selector: 'lc-review-home-controls',
  templateUrl: './review-home-controls.component.html',
  styleUrl: './review-home-controls.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, IonItem, IonLabel, TranslatePipe],
})
export class ReviewHomeControlsComponent {
  readonly dashboard = input.required<ReviewHomeDashboard>();
  readonly morePracticeAvailable = input(true);
  readonly reviewSettingsRequested = output<void>();
  readonly progressRequested = output<void>();
  readonly morePracticeRequested = output<void>();

  readonly studyModeLabelKey = computed(() =>
    this.dashboard().preferences.mode === 'type' ? 'review.mode.type' : 'review.mode.flip',
  );
  readonly autoplayLabelKey = computed(() =>
    `review.audioAutoplay.${this.dashboard().preferences.autoplay}`,
  );
  readonly dailyGoalComplete = computed(() =>
    this.dashboard().completedToday >= this.dashboard().goal,
  );

  constructor() {
    addIcons({
      bookOutline,
      chevronForwardOutline,
      flameOutline,
      settingsOutline,
      statsChartOutline,
    });
  }
}
