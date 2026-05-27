import {Component, computed, inject} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {toSignal} from '@angular/core/rxjs-interop';
import {map} from 'rxjs/operators';
import {AlertController, IonContent, IonHeader, IonIcon, IonToolbar, ModalController,} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {
  chevronBackOutline,
  createOutline,
  ellipsisHorizontalOutline,
  trashOutline,
  volumeHighOutline,
} from 'ionicons/icons';
import {CardStore} from '../../../../core/store/card.store';
import {CategoryStore} from '../../../../core/store/category.store';
import {CardApiService} from '../../../../core/services/card-api.service';
import {AudioService} from '../../../../core/services/audio.service';
import {ArticleBadgeComponent} from '../../../../shared/components/article-badge/article-badge.component';
import {AddWordSheetComponent} from '../../components/add-word-sheet/add-word-sheet.component';
import {getCategoryName} from '../../../../shared/helpers/helpers';

@Component({
  selector: 'app-word-detail',
  standalone: true,
  templateUrl: './word-detail.component.html',
  styleUrls: ['./word-detail.component.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonIcon, ArticleBadgeComponent],
})
export class WordDetailComponent {
  private readonly cardStore = inject(CardStore);
  private readonly categoryStore = inject(CategoryStore);
  private readonly cardApi = inject(CardApiService);
  private readonly audioService = inject(AudioService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly alertCtrl = inject(AlertController);
  private readonly modalCtrl = inject(ModalController);

  constructor() {
    addIcons({
      chevronBackOutline,
      ellipsisHorizontalOutline,
      volumeHighOutline,
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

  readonly masteryPercent = computed(() => {
    const lvl = this.card()?.srsState?.masteryLevel ?? 0;
    return (lvl / 5) * 100;
  });

  readonly masteryColor = computed(() => {
    const lvl = this.card()?.srsState?.masteryLevel ?? 0;
    return ['#D1D5DB', '#FCA5A5', '#FCD34D', '#6EE7B7', '#34D399', '#059669'][lvl];
  });

  readonly masteryLabel = computed(() => {
    const state = this.card()?.srsState?.state;
    if (!state || state === 'new') return 'New';
    return {learning: 'Learning', review: 'Review', mastered: 'Mastered'}[state] ?? 'New';
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
    const id = this.card()?.categoryIds[0];
    return id ? getCategoryName(id, this.categories()) : '';
  });

  goBack(): void {
    this.router.navigate(['/vault']);
  }

  playPronunciation(): void {
    const word = this.card()?.content.back;
    if (!word) return;
    this.audioService.speak(word, 'de-DE', 0.85).subscribe({
      error: () => {
      }
    });
  }

  async openEdit(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: AddWordSheetComponent,
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
