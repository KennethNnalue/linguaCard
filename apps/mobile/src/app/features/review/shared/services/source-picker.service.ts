import {inject, Injectable} from '@angular/core';
import {TranslateService} from '@ngx-translate/core';
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
  private readonly translate = inject(TranslateService);

  async pick(header?: string): Promise<string | null> {
    const resolvedHeader = header ?? this.translate.instant('srs.selectCollection');
    const allLabel = `📚 ${this.translate.instant('srs.allCollections')}`;
    const collections = this.collectionStore.collections();
    return new Promise(resolve => {
      const actions: BottomSheetAction[] = [
        {
          label: allLabel,
          icon: 'library-outline',
          handler: () => resolve(ReviewSource.ALL),
        },
        ...collections.map(col => ({
          label: `${col.emoji ?? '📚'} ${col.name}`,
          handler: () => resolve(col.id),
        })),
        {
          label: this.translate.instant('common.cancel'),
          role: 'cancel' as const,
          handler: () => resolve(null),
        },
      ];
      this.bottomSheet.open(resolvedHeader, actions).then(() => resolve(null));
    });
  }

  labelFor(sourceId: string): string {
    const allLabel = `📚 ${this.translate.instant('srs.allCollections')}`;
    if (sourceId === ReviewSource.ALL) return allLabel;
    const col = this.collectionStore.collections().find(c => c.id === sourceId);
    return col ? `${col.emoji ?? '📚'} ${col.name}` : allLabel;
  }
}
