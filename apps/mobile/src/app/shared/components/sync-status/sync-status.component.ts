import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { SyncService } from '../../../core/services/sync.service';

@Component({
  selector: 'lc-sync-status',
  templateUrl: './sync-status.component.html',
  styleUrls: ['./sync-status.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SyncStatusComponent {
  readonly sync = inject(SyncService);
  private readonly translate = inject(TranslateService);

  get label(): string {
    const status = this.sync.syncStatus();
    const count = this.sync.pendingCount();
    switch (status) {
      case 'pending':
        return this.translate.instant('sync.status.pending', { count });
      case 'syncing':
        return this.translate.instant('sync.status.syncing');
      case 'error':
        return this.translate.instant('sync.status.error');
      default:
        return this.translate.instant('sync.status.synced');
    }
  }

  retrySync(): void {
    if (this.sync.syncStatus() === 'error') {
      void this.sync.forceSync();
    }
  }
}
