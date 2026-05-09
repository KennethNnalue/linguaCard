import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ActionSheetController,
  IonContent,
  IonHeader,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, chevronDownOutline, playOutline, volumeHighOutline } from 'ionicons/icons';
import { AuthService } from '../../../../core/services/auth.service';
import { CardStore } from '../../../../core/store/card.store';
import { CategoryStore } from '../../../../core/store/category.store';
import { CollectionStore } from '../../../vault/store/collection.store';
import { getCategoryName } from '../../../../shared/helpers/helpers';
import { ArticleBadgeComponent } from '../../../../shared/components/article-badge/article-badge.component';
import { MasteryDotComponent } from '../../../../shared/components/mastery-dot/mastery-dot.component';
import { UserMenuComponent } from '../../../../shared/components/user-menu/user-menu.component';
import { AddWordSheetComponent } from '../../../vault/components/add-word-sheet/add-word-sheet.component';
import { ResetDataSheetComponent } from '../../../auth/components/reset-data-sheet/reset-data-sheet.component';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  imports: [
    RouterLink,
    MasteryDotComponent,
    ArticleBadgeComponent,
    UserMenuComponent,
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
  private readonly categoryStore = inject(CategoryStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly modalCtrl = inject(ModalController);
  private readonly actionSheetCtrl = inject(ActionSheetController);
  private readonly authService = inject(AuthService);

  constructor() {
    addIcons({ addOutline, playOutline, volumeHighOutline, chevronDownOutline });
  }

  readonly user = this.authService.currentUser;
  readonly menuOpen = signal(false);
  readonly loading = this.cardStore.isLoading;
  readonly recent = this.cardStore.recentCards;
  readonly categories = this.categoryStore.categories;
  readonly selectedCollectionId = signal<string | null>(null);

  readonly greeting = computed(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Guten Morgen';
    if (h < 18) return 'Guten Tag';
    return 'Guten Abend';
  });

  readonly selectedCollectionLabel = computed(() => {
    const id = this.selectedCollectionId();
    if (!id) return 'All collections';
    const col = this.collectionStore.collections().find(c => c.id === id);
    return col ? `${col.emoji} ${col.name}` : 'All collections';
  });

  readonly filteredDueCount = computed(() => {
    const id = this.selectedCollectionId();
    const due = this.cardStore.dueCards();
    return id ? due.filter(c => c.collectionId === id).length : due.length;
  });

  readonly stats = computed(() => ({
    dueToday: this.filteredDueCount(),
    newCards: this.cardStore.newCount(),
    dayStreak: 0,
    totalCards: this.cardStore.totalCount(),
    masteredCards: this.cardStore.masteredCount(),
  }));

  toggleMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen.update(v => !v);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

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

  async openResetSheet(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: ResetDataSheetComponent,
      breakpoints: [0, 0.65, 0.85],
      initialBreakpoint: 0.65,
      handleBehavior: 'cycle',
    });
    await modal.present();
  }

  async openCollectionPicker(): Promise<void> {
    const collections = this.collectionStore.collections();
    const actionSheet = await this.actionSheetCtrl.create({
      header: 'Filter by collection',
      buttons: [
        {
          text: 'All collections',
          handler: () => { this.selectedCollectionId.set(null); },
        },
        ...collections.map(col => ({
          text: `${col.emoji} ${col.name}`,
          handler: () => { this.selectedCollectionId.set(col.id); },
        })),
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await actionSheet.present();
  }

  handleRefresh(event: any): void {
    this.cardStore.loadCards();
    setTimeout(() => event.target.complete(), 800);
  }

  protected getCategory(id: string): string {
    return getCategoryName(id, this.categories());
  }
}
