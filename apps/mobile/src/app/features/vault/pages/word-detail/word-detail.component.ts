import {Component, computed, inject} from '@angular/core';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {toSignal} from '@angular/core/rxjs-interop';
import {map} from 'rxjs/operators';
import {AlertController, IonContent, IonHeader, IonIcon, IonToolbar, ModalController,} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {
  chevronBackOutline,
  createOutline,
  ellipsisHorizontalOutline,
  micOutline,
  playOutline,
  trashOutline,
  volumeHighOutline,
} from 'ionicons/icons';
import {CardStore} from '../../store/card.store';
import {CategoryStore} from '../../store/category.store';
import {CardApiService} from '../../services/card-api.service';
import {PronunciationService} from '../../../ai/audio/pronunciation.service';
import {ArticleBadgeComponent} from '../../../../shared/components/article-badge/article-badge.component';
import {AddWordSheetComponent} from '../../components/add-word-sheet/add-word-sheet.component';
import {getCategoryName} from '../../../../shared/helpers/helpers';

@Component({
  selector: 'lc-word-detail',
  standalone: true,
  templateUrl: './word-detail.component.html',
  styleUrls: ['./word-detail.component.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonIcon, ArticleBadgeComponent, RouterLink],
})
export class WordDetailComponent {
  private readonly cardStore = inject(CardStore);
  private readonly categoryStore = inject(CategoryStore);
  private readonly cardApi = inject(CardApiService);
  private readonly pronunciationService = inject(PronunciationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly alertCtrl = inject(AlertController);
  private readonly modalCtrl = inject(ModalController);

  constructor() {
    addIcons({
      chevronBackOutline,
      ellipsisHorizontalOutline,
      volumeHighOutline,
      micOutline,
      playOutline,
      createOutline,
      trashOutline,
    });
  }

  private readonly cardId = toSignal(
    this.route.params.pipe(map((p) => p['id'] as string)),
    {initialValue: ''},
  );

  readonly card = computed(
    () => this.cardStore.cards().find((c) => c.id === this.cardId()) ?? null,
  );

  readonly categories = this.categoryStore.categories;

  readonly masteryLevel = computed(() => this.card()?.srsState?.masteryLevel ?? 0);


  // Used only for the SVG ring stroke — mastery colors are the same in both modes
  readonly masteryColor = computed(() =>
    ['var(--lc-mastery-0)', 'var(--lc-mastery-1)', 'var(--lc-mastery-2)',
     'var(--lc-mastery-3)', 'var(--lc-mastery-4)', 'var(--lc-mastery-5)'][this.masteryLevel()]
  );

  readonly masteryLabel = computed(() => {
    const state = this.card()?.srsState?.state;
    if (!state || state === 'new') return 'New';
    return {learning: 'Learning', review: 'Review', mastered: 'Mastered'}[state] ?? 'New';
  });

  readonly masteryRingOffset = computed(() => {
    // Circumference for r=22: 2π*22 ≈ 138.23
    const circumference = 2 * Math.PI * 22;
    const progress = this.masteryLevel() / 5;
    return circumference * (1 - progress);
  });

  readonly nextReviewText = computed(() => {
    const nextDue = this.card()?.srsState?.nextDueAt;
    if (!nextDue) return '—';
    const days = Math.ceil((new Date(nextDue).getTime() - Date.now()) / 86_400_000);
    if (days <= 0) return 'Due now';
    if (days === 1) return 'Tomorrow';
    return `Next review in ${days} days`;
  });

  readonly lastReviewedText = computed(() => {
    const last = this.card()?.srsState?.lastReviewedAt;
    if (!last) return 'Never';
    const days = Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000);
    if (days === 0) return 'Today';
    if (days === 1) return '1d ago';
    return `${days}d ago`;
  });

  readonly intervalText = computed(() => `${this.card()?.srsState?.intervalDays ?? 0}d`);

  readonly categoryName = computed(() => {
    const id = this.card()?.categoryIds?.[0];
    return id ? getCategoryName(id, this.categories()) : '';
  });

  readonly relatedWords = computed(() => {
    const card = this.card();
    if (!card) return [];
    const word = card.content.back.toLowerCase();
    const stem = word.slice(0, 4);
    return this.cardStore.cards()
      .filter(c => c.id !== card.id)
      .filter(c => {
        const other = c.content.back.toLowerCase();
        return (other.includes(stem) || word.includes(other.slice(0, 4)))
          && Math.abs(other.length - word.length) <= 5;
      })
      .slice(0, 5);
  });

  goBack(): void {
    this.router.navigate(['/vault']);
  }

  readonly isPronunciationLoading = this.pronunciationService.isLoading;

  playPronunciation(): void {
    const card = this.card();
    if (!card) return;
    void this.pronunciationService.play(card);
  }

  async openEdit(): Promise<void> {
    const card = this.card();
    const modal = await this.modalCtrl.create({
      component: AddWordSheetComponent,
      componentProps: {cardToEdit: card},
      breakpoints: [0, 0.95, 1],
      initialBreakpoint: 0.95,
      handleBehavior: 'cycle',
    });
    await modal.present();
    const {data} = await modal.onWillDismiss();
    if (data?.created) this.cardStore.loadCards();
  }

  async confirmDelete(): Promise<void> {
    const wordBack = this.card()?.content.back ?? 'this word';
    const alert = await this.alertCtrl.create({
      header: 'Delete word',
      message: `Remove "${wordBack}" from your vault? This cannot be undone.`,
      buttons: [
        {text: 'Cancel', role: 'cancel'},
        {text: 'Delete', role: 'destructive', handler: () => this.deleteCard()},
      ],
    });
    await alert.present();
  }

  highlightWord(sentence: string, word: string): string {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return sentence.replace(new RegExp(`(${escaped})`, 'gi'), '<strong>$1</strong>');
  }

  private deleteCard(): void {
    const id = this.cardId();
    if (!id) return;
    this.cardApi.remove(id).subscribe(() => {
      this.cardStore.loadCards();
      this.router.navigate(['/vault']);
    });
  }
}
