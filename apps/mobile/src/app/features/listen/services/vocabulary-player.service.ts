import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { VocabularyPlaylistRequest } from '../models/listen.models';
import { ListenStore } from '../store/listen.store';

@Injectable({ providedIn: 'root' })
export class VocabularyPlayerService {
  private readonly store = inject(ListenStore);
  private readonly router = inject(Router);

  async open(request: VocabularyPlaylistRequest): Promise<void> {
    this.store.openPlaylist(request);
    await this.router.navigate(['/listen/now-playing']);
    this.store.start({ shuffle: false });
  }
}
