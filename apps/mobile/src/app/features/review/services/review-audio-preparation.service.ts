import { effect, inject, Injectable, Injector, untracked } from '@angular/core';
import type { ScheduledCard, WordAudioResolveRequest } from '@lingua-card/shared/domain';
import { AuthService } from '../../../core/services/auth.service';
import { NetworkService } from '../../../core/services/network.service';
import { SettingsStore } from '../../settings/store/settings.store';
import {
  cardPronunciationText,
  WordAudioService,
  type AudioPreWarmResult,
} from '../../../shared/audio/word-audio.service';
import { CardStore } from '../../vault/store/card.store';
import type { ReviewSessionSource } from '../domain/review-domain';
import { ReviewPrefsService, toPromptDirection, toReviewMode } from './review-prefs.service';
import { ReviewSessionBuilderService } from './review-session-builder.service';

const ONLINE_RETRY_DELAYS_MS = [250, 1_000] as const;

export function reviewAudioRequests(cards: readonly ScheduledCard[]): WordAudioResolveRequest[] {
  return cards.flatMap(card => [
    {
      text: cardPronunciationText(card),
      language: 'de-DE',
    },
    ...(card.content.examples ?? [])
      .filter(example => example.target.trim())
      .map(example => ({ text: example.target.trim(), language: 'de-DE' })),
    ...(card.content.synonyms ?? [])
      .filter(synonym => synonym.example.trim())
      .map(synonym => ({ text: synonym.example.trim(), language: 'de-DE' })),
  ]);
}

function preparationFingerprint(
  userId: string | null,
  cards: readonly ScheduledCard[],
  dailyGoal: number,
  timeZone: string,
  online: boolean,
): string {
  return JSON.stringify({
    userId,
    dailyGoal,
    timeZone,
    online,
    cards: cards.map(card => ({
      id: card.id,
      collectionId: card.collectionId,
      createdAt: card.createdAt,
      reviewState: card.reviewState,
      audio: reviewAudioRequests([card]),
    })),
  });
}

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

@Injectable({ providedIn: 'root' })
export class ReviewAudioPreparationService {
  private readonly wordAudio = inject(WordAudioService);
  private readonly cardStore = inject(CardStore);
  private readonly sessionBuilder = inject(ReviewSessionBuilderService);
  private readonly settingsStore = inject(SettingsStore);
  private readonly reviewPrefs = inject(ReviewPrefsService);
  private readonly auth = inject(AuthService);
  private readonly network = inject(NetworkService);
  private readonly injector = inject(Injector);
  private preparationChain: Promise<void> = Promise.resolve();
  private readonly fingerprints = new Map<string, string>();
  private readonly generations = new Map<string, number>();
  private initialized = false;

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    effect(() => {
      const dailyGoal = this.settingsStore.dailyGoal();
      this.prepareSource({ kind: 'daily' }, dailyGoal);
    }, { injector: this.injector });
  }

  prepare(cards: readonly ScheduledCard[]): Promise<AudioPreWarmResult> {
    return this.wordAudio.preWarm(reviewAudioRequests(cards));
  }

  prepareSource(source: ReviewSessionSource, limit: number): void {
    const cards = this.cardStore.cards();
    const online = this.network.isOnline();
    const timeZone = this.settingsStore.settings()?.timezone
      ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const userId = this.auth.currentUser()?.id ?? null;
    const sourceKey = JSON.stringify(source);
    const fingerprint = preparationFingerprint(userId, cards, limit, timeZone, online);
    if (fingerprint === this.fingerprints.get(sourceKey)) return;

    this.fingerprints.set(sourceKey, fingerprint);
    const generation = (this.generations.get(sourceKey) ?? 0) + 1;
    this.generations.set(sourceKey, generation);
    untracked(() => this.enqueuePreparation({
      source,
      sourceKey,
      cards,
      limit,
      timeZone,
      online,
      generation,
    }));
  }

  private enqueuePreparation(snapshot: {
    source: ReviewSessionSource;
    sourceKey: string;
    cards: readonly ScheduledCard[];
    limit: number;
    timeZone: string;
    online: boolean;
    generation: number;
  }): void {
    this.preparationChain = this.preparationChain.then(async () => {
      if (!this.isCurrent(snapshot.sourceKey, snapshot.generation)) return;
      const selection = await this.sessionBuilder.select({
        source: snapshot.source,
        limit: snapshot.limit,
        mode: toReviewMode(this.reviewPrefs.mode()),
        direction: toPromptDirection(this.reviewPrefs.dir()),
      }, new Date(), { timeZone: snapshot.timeZone });
      if (selection.kind !== 'selected' || !this.isCurrent(snapshot.sourceKey, snapshot.generation)) return;

      const cardsById = new Map(snapshot.cards.map(card => [card.id, card]));
      const selectedCards = selection.cardIds
        .map(cardId => cardsById.get(cardId))
        .filter((card): card is ScheduledCard => card !== undefined);
      await this.prepareRequestsWithRetry(
        reviewAudioRequests(selectedCards),
        snapshot.online,
        snapshot.sourceKey,
        snapshot.generation,
      );
    }).catch(error => {
      console.warn('[ReviewAudioPreparation] Background preparation failed', error);
    });
  }

  private async prepareRequestsWithRetry(
    requests: readonly WordAudioResolveRequest[],
    online: boolean,
    sourceKey: string,
    generation: number,
  ): Promise<void> {
    let pending = requests;
    for (let attempt = 0; pending.length > 0; attempt += 1) {
      if (!this.isCurrent(sourceKey, generation)) return;
      const result = await this.wordAudio.preWarm(pending);
      pending = result.failedRequests;
      if (!online || pending.length === 0 || attempt >= ONLINE_RETRY_DELAYS_MS.length) return;
      await wait(ONLINE_RETRY_DELAYS_MS[attempt]);
    }
  }

  private isCurrent(sourceKey: string, generation: number): boolean {
    return this.generations.get(sourceKey) === generation;
  }
}
