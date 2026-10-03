import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
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
    void firstValueFrom(this.api.recordEvent({ ...event, eventId: crypto.randomUUID() }))
      .catch(() => this.failed.update(value => value + 1));
  }
}
