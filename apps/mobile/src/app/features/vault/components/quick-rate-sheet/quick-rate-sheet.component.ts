import { ChangeDetectionStrategy, Component, inject, Input, signal } from '@angular/core';
import { IonContent, IonHeader, IonIcon, IonToolbar, ModalController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkOutline, closeOutline, volumeHighOutline } from 'ionicons/icons';
import { Card, ConfidenceRating } from '@lingua-card/shared/domain';
import { ReviewStore } from '../../../review/store/review.store';
import { WordAudioService } from '../../../../shared/audio/word-audio.service';
import { ArticleBadgeComponent } from '../../../../shared/components/article-badge/article-badge.component';
import { RATING_OPTIONS } from '../../../review/models/review.model';

@Component({
  selector: 'lc-quick-rate-sheet',
  templateUrl: './quick-rate-sheet.component.html',
  styleUrls: ['./quick-rate-sheet.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonHeader, IonToolbar, IonContent, IonIcon, ArticleBadgeComponent],
})
export class QuickRateSheetComponent {
  private readonly modalCtrl = inject(ModalController);
  private readonly reviewStore = inject(ReviewStore);
  private readonly wordAudio = inject(WordAudioService);

  @Input() card!: Card;

  readonly revealed = signal(false);
  readonly rated = signal(false);
  readonly ratings = RATING_OPTIONS;

  constructor() {
    addIcons({ closeOutline, volumeHighOutline, checkmarkOutline });
  }

  reveal(): void {
    this.revealed.set(true);
  }

  rate(rating: ConfidenceRating): void {
    if (this.rated()) return;
    this.rated.set(true);
    this.reviewStore.rateCard(this.card, rating);
    setTimeout(() => this.modalCtrl.dismiss({ rated: true, rating }), 600);
  }

  playAudio(): void {
    void this.wordAudio.playCard(this.card);
  }

  dismiss(): void {
    void this.modalCtrl.dismiss({ rated: false });
  }
}
