import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import type { PodcastClientEvent } from '@lingua-card/shared/domain';
import { PodcastApiService } from '../data-access/podcast-api.service';

@Injectable({ providedIn: 'root' })
export class PodcastDiscoveryEventsService {
  private readonly api = inject(PodcastApiService);
  private readonly changed = signal(0);
  private readonly failed = signal(0);
  readonly revision = this.changed.asReadonly();
  readonly failedEventCount = this.failed.asReadonly();
  refresh(): void { this.changed.update(value => value + 1); }
  record(event: Omit<PodcastClientEvent, 'eventId'>): void {
    void this.recordAndWait(event);
  }
  async recordAndWait(event: Omit<PodcastClientEvent, 'eventId'>): Promise<void> {
    try { await firstValueFrom(this.api.recordEvent({ ...event, eventId: crypto.randomUUID() }).pipe(timeout(5000))); }
    catch { this.failed.update(value => value + 1); }
  }
}
