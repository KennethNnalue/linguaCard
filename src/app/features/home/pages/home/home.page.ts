import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, playOutline, volumeHighOutline } from 'ionicons/icons';
import { MockAuthService, MockCategoryService } from '../../../../core/services/mock-services';
import { CardStore } from '../../../../core/store/card.store';
import { getCategoryName } from '../../../../shared/helpers/helpers';
import { ArticleBadgeComponent } from '../../../../shared/components/article-badge/article-badge.component';
import { MasteryDotComponent } from '../../../../shared/components/mastery-dot/mastery-dot.component';
import { AddWordSheetComponent } from '../../../vault/components/add-word-sheet/add-word-sheet.component';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  imports: [
    RouterLink,
    MasteryDotComponent,
    ArticleBadgeComponent,
    IonRefresherContent,
    IonRefresher,
    IonContent,
    IonIcon,
    IonToolbar,
    IonHeader,
  ],
})
export class HomePage {
  private readonly cardStore = inject(CardStore);
  private readonly authService = inject(MockAuthService);
  private readonly categoryService = inject(MockCategoryService);
  private readonly modalCtrl = inject(ModalController);

  constructor() {
    addIcons({ addOutline, playOutline, volumeHighOutline });
  }

  readonly user = this.authService.user;
  readonly loading = this.cardStore.isLoading;
  readonly recent = this.cardStore.recentCards;
  readonly categories = this.categoryService.categories;

  readonly greeting = computed(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Guten Morgen';
    if (h < 18) return 'Guten Tag';
    return 'Guten Abend';
  });

  readonly stats = computed(() => ({
    dueToday: this.cardStore.dueCards().length,
    newCards: this.cardStore.newCount(),
    dayStreak: 0,
    totalCards: this.cardStore.totalCount(),
    masteredCards: this.cardStore.masteredCount(),
  }));

  async openAddWord(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: AddWordSheetComponent,
      breakpoints: [0, 0.85, 1],
      initialBreakpoint: 0.85,
      handleBehavior: 'cycle',
    });
    await modal.present();
    const { data } = await modal.onWillDismiss();
    if (data?.created) this.cardStore.loadCards();
  }

  handleRefresh(event: any): void {
    this.cardStore.loadCards();
    setTimeout(() => event.target.complete(), 800);
  }

  protected getCategory(id: string): string {
    return getCategoryName(id, this.categories());
  }
}
