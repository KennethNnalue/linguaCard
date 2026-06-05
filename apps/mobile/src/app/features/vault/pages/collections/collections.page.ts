// TODO: delete after LC-202 ships — route redirected to /vault?tab=collections
import { Component, computed, inject } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { Router } from '@angular/router';
import {
  ActionSheetController,
  IonContent,
  IonHeader,
  IonIcon,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, chevronBackOutline, cloudUploadOutline } from 'ionicons/icons';
import type { Collection } from '@lingua-card/shared/domain';
import { CardStore } from '../../store/card.store';
import { CollectionStore } from '../../store/collection.store';
import { AssignCollectionSheetComponent } from '../../components/assign-collection-sheet/assign-collection-sheet.component';

@Component({
  selector: 'lc-collections',
  standalone: true,
  templateUrl: './collections.page.html',
  styleUrls: ['./collections.page.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonIcon, SlicePipe],
})
export class CollectionsPage {
  private readonly router = inject(Router);
  private readonly modalCtrl = inject(ModalController);
  private readonly actionSheetCtrl = inject(ActionSheetController);
  private readonly cardStore = inject(CardStore);
  readonly store = inject(CollectionStore);

  constructor() {
    addIcons({ addOutline, chevronBackOutline, cloudUploadOutline });
  }

  readonly totalCards = this.store.totalCards;

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

  navigateToImport(): void {
    this.router.navigate(['/vault/import']);
  }

  async openCreateSheet(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: AssignCollectionSheetComponent,
      breakpoints: [0, 0.6, 0.85],
      initialBreakpoint: 0.6,
      handleBehavior: 'cycle',
      componentProps: { autoConfirmOnCreate: true },
    });
    await modal.present();
    const { data } = await modal.onWillDismiss();
    this.store.loadCollections();

    // After creating a new collection, offer to import cards into it
    if (data?.collectionId) {
      await this._promptImportAfterCreate(data.collectionId);
    }
  }

  private async _promptImportAfterCreate(collectionId: string): Promise<void> {
    const sheet = await this.actionSheetCtrl.create({
      header: 'Add words to your collection?',
      buttons: [
        {
          text: 'Import from CSV',
          icon: 'cloud-upload-outline',
          handler: () => this.router.navigate(['/vault/import']),
        },
        {
          text: 'Import from image',
          icon: 'cloud-upload-outline',
          handler: () => this.router.navigate(['/vault/import/image']),
        },
        {
          text: 'Go to collection',
          handler: () => this.router.navigate(['/vault/collections', collectionId]),
        },
        { text: 'Maybe later', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  progressPercent(col: Collection): number {
    if (!col.cardCount) return 0;
    return Math.round((col.masteredCount / col.cardCount) * 100);
  }
}
