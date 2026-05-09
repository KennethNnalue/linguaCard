import { Component, inject } from '@angular/core';
import { SyncService } from '../../../core/services/sync.service';

@Component({
  selector: 'app-sync-status',
  templateUrl: './sync-status.component.html',
  styleUrls: ['./sync-status.component.scss'],
  standalone: true,
})
export class SyncStatusComponent {
  readonly sync = inject(SyncService);

  get label(): string {
    const status = this.sync.syncStatus();
    const count = this.sync.pendingCount();
    switch (status) {
      case 'pending':
        return `${count} pending`;
      case 'syncing':
        return 'Syncing…';
      case 'error':
        return 'Sync error';
      default:
        return 'Synced';
    }
  }

  retrySync(): void {
    if (this.sync.syncStatus() === 'error') {
      void this.sync.forceSync();
    }
  }
}
