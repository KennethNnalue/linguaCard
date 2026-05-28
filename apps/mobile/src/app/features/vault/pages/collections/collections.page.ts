import { Component, computed, inject } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, chevronBackOutline } from 'ionicons/icons';
import { Collection } from '../../../../core/models/mock-data';
import { CardStore } from '../../../../core/store/card.store';
import { CollectionStore } from '../../store/collection.store';
import { AssignCollectionSheetComponent } from '../../components/assign-collection-sheet/assign-collection-sheet.component';

@Component({
  selector: 'app-collections',
  standalone: true,
  templateUrl: './collections.page.html',
  styleUrls: ['./collections.page.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonIcon, SlicePipe],
})
export class CollectionsPage {
  private readonly router = inject(Router);
  private readonly modalCtrl = inject(ModalController);
  private readonly cardStore = inject(CardStore);
  readonly store = inject(CollectionStore);

  constructor() {
    addIcons({ addOutline, chevronBackOutline });
  }

  readonly totalCards = this.store.totalCards;

  // Live due count derived from card SRS data — updates immediately after a review
  readonly totalDue = computed(() => this.cardStore.dueCards().length);

  readonly collections = computed(() => {
    const now = new Date();
    const cards = this.cardStore.cards();
    return this.store.collections().map(col => ({
      ...col,
      dueCount: cards.filter(
        c => c.collectionId === col.id && c.srsState && new Date(c.srsState.nextDueAt) <= now,
      ).length,
    }));
  });

  openDetail(col: Collection): void {
    this.router.navigate(['/vault/collections', col.id]);
  }

  goBack(): void {
    this.router.navigate(['/vault']);
  }

  async openCreateSheet(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: AssignCollectionSheetComponent,
      breakpoints: [0, 0.6, 0.85],
      initialBreakpoint: 0.6,
      handleBehavior: 'cycle',
    });
    await modal.present();
    await modal.onWillDismiss();
    this.store.loadCollections();
  }

  progressPercent(col: Collection): number {
    if (!col.cardCount) return 0;
    return Math.round((col.masteredCount / col.cardCount) * 100);
  }

  categoryNamesForCollection(_col: Collection): string {
    return '';
  }
}
