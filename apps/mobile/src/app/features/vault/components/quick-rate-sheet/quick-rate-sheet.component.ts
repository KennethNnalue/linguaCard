import { ChangeDetectionStrategy, Component, computed, inject, Input, signal } from '@angular/core';
import { IonContent, IonHeader, IonIcon, IonToolbar, ModalController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkOutline, chevronDownOutline, closeOutline, volumeHighOutline } from 'ionicons/icons';
import { Card, ConfidenceRating } from '@lingua-card/shared/domain';
import { FsrsService } from '../../../../shared/srs/fsrs.service';
import { ReviewStore } from '../../../review/store/review.store';
import { WordAudioService } from '../../../../shared/audio/word-audio.service';
import { ArticleBadgeComponent } from '../../../../shared/components/article-badge/article-badge.component';
import { buildRatingOptionsWithPreviews, RATING_OPTIONS_NO_PREVIEW, RatingOption } from '../../../review/models/review.model';

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
  private readonly fsrs = inject(FsrsService);

  @Input() set card(value: Card) {
    this._card = {
      ...value,
      content: {
        ...value.content,
        synonyms: value.content.synonyms ?? [],
        examples: value.content.examples ?? [],
      },
    };
  }
  get card(): Card { return this._card; }
  private _card!: Card;

  readonly revealed = signal(false);
  readonly rated = signal(false);

  readonly ratingOptions = computed<RatingOption[]>(() => {
    if (!this.revealed() || !this.card?.srsState) return RATING_OPTIONS_NO_PREVIEW;
    return buildRatingOptionsWithPreviews(this.fsrs.previewIntervals(this.card.srsState));
  });

  private readonly expandedSynonym = signal<number | null>(null);

  constructor() {
    addIcons({ closeOutline, volumeHighOutline, checkmarkOutline, chevronDownOutline });
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

  playExample(sentence: string): void {
    void this.wordAudio.play(sentence, 'de-DE');
  }

  playPlural(): void {
    const plural = this.card?.content.plural;
    if (plural) void this.wordAudio.play(plural, 'de-DE');
  }

  toggleSynonym(i: number): void {
    this.expandedSynonym.set(this.expandedSynonym() === i ? null : i);
  }

  isSynonymExpanded(i: number): boolean {
    return this.expandedSynonym() === i;
  }

  highlightWord(sentence: string, word: string): string {
    if (!sentence || !word) return sentence;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return sentence.replace(new RegExp(`(${escaped})`, 'gi'), '<strong>$1</strong>');
  }

  dismiss(): void {
    void this.modalCtrl.dismiss({ rated: false });
  }
}
