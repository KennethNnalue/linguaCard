import { inject, Injectable } from '@angular/core';
import { ActionSheetController } from '@ionic/angular/standalone';
import { CollectionStore } from '../../../vault/store/collection.store';
import { ReviewSource } from '../../models/review.model';

export interface SourcePickerResult {
  id: string;
  label: string;
}

@Injectable({ providedIn: 'root' })
export class SourcePickerService {
  private readonly actionSheetCtrl = inject(ActionSheetController);
  private readonly collectionStore = inject(CollectionStore);

  /** Opens an ActionSheet to pick ALL or a specific collection.
   *  Returns the selected source ID (ReviewSource.ALL or a collection id), or null if cancelled. */
  async pick(header = 'Select source'): Promise<string | null> {
    const collections = this.collectionStore.collections();
    return new Promise(async resolve => {
      const sheet = await this.actionSheetCtrl.create({
        header,
        buttons: [
          {
            text: '📚 All collections',
            handler: () => resolve(ReviewSource.ALL),
          },
          ...collections.map(col => ({
            text: `${col.emoji ?? '📚'} ${col.name}`,
            handler: () => resolve(col.id),
          })),
          {
            text: 'Cancel',
            role: 'cancel',
            handler: () => resolve(null),
          },
        ],
      });
      await sheet.present();
    });
  }

  /** Returns the display label for a source ID. */
  labelFor(sourceId: string): string {
    if (sourceId === ReviewSource.ALL) return '📚 All collections';
    const col = this.collectionStore.collections().find(c => c.id === sourceId);
    return col ? `${col.emoji ?? '📚'} ${col.name}` : '📚 All collections';
  }
}
