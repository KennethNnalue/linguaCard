import {inject, Injectable} from '@angular/core';
import {CollectionStore} from '../../../vault/store/collection.store';
import {ReviewSource} from '../../models/review.model';
import {BottomSheetService} from '../../../../shared/components/bottom-sheet/bottom-sheet.service';
import {BottomSheetAction} from '../../../../shared/components/bottom-sheet/bottom-sheet.component';

export interface SourcePickerResult {
  id: string;
  label: string;
}

@Injectable({ providedIn: 'root' })
export class SourcePickerService {
  private readonly bottomSheet = inject(BottomSheetService);
  private readonly collectionStore = inject(CollectionStore);

  /** Opens a bottom sheet to pick ALL or a specific collection.
   *  Returns the selected source ID (ReviewSource.ALL or a collection id), or null if cancelled. */
  async pick(header = 'Select source'): Promise<string | null> {
    const collections = this.collectionStore.collections();
    return new Promise(resolve => {
      const actions: BottomSheetAction[] = [
        {
          label: '📚 All collections',
          icon: 'library-outline',
          handler: () => resolve(ReviewSource.ALL),
        },
        ...collections.map(col => ({
          label: `${col.emoji ?? '📚'} ${col.name}`,
          handler: () => resolve(col.id),
        })),
        {
          label: 'Cancel',
          role: 'cancel' as const,
          handler: () => resolve(null),
        },
      ];
      this.bottomSheet.open(header, actions).then(() => resolve(null));
    });
  }

  /** Returns the display label for a source ID. */
  labelFor(sourceId: string): string {
    if (sourceId === ReviewSource.ALL) return '📚 All collections';
    const col = this.collectionStore.collections().find(c => c.id === sourceId);
    return col ? `${col.emoji ?? '📚'} ${col.name}` : '📚 All collections';
  }
}
