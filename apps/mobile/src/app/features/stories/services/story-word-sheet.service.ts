import { inject, Injectable } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import type { StoryKeyword, StoryVocabWord, WordDictionaryEntry } from '@lingua-card/shared/domain';
import type { TappedWord, WordDetail } from '../models/reader.model';
import { CardStore } from '../../vault/store/card.store';
import { CardDedupService } from '../../../shared/dedup/card-dedup.service';
import { DictionaryApiService } from '../../vault/services/dictionary-api.service';
import { WordAudioService } from '../../../shared/audio/word-audio.service';
import { AuthService } from '../../../core/services/auth.service';
import { AssignCollectionSheetComponent } from '../../vault/components/assign-collection-sheet/assign-collection-sheet.component';

/** Default deck every story-created card is filed under (matches vault/import). */
const DEFAULT_DECK_ID = 'deck-001';

const GENDER_MAP: Record<string, 'masculine' | 'feminine' | 'neuter'> = {
  der: 'masculine',
  die: 'feminine',
  das: 'neuter',
};

/**
 * Shared word-sheet logic for both story readers: resolves the tapped word into
 * a display detail, checks vault membership, plays pronunciation and creates a
 * vault card (with a collection picker). The two readers render their own
 * (visually distinct) sheets but back them with this single service.
 */
@Injectable({ providedIn: 'root' })
export class StoryWordSheetService {
  private readonly cardStore = inject(CardStore);
  private readonly dedup = inject(CardDedupService);
  private readonly dictionary = inject(DictionaryApiService);
  private readonly wordAudio = inject(WordAudioService);
  private readonly authService = inject(AuthService);
  private readonly modalCtrl = inject(ModalController);
  private readonly toastCtrl = inject(ToastController);
  private readonly translate = inject(TranslateService);

  /**
   * Resolve a tapped word into a `WordDetail`. Keywords (which carry wordType,
   * article and conjugations) take precedence; `vocabWords` is an optional
   * fallback for user stories. Unknown words return a bare detail.
   */
  resolveDetail(
    tapped: TappedWord,
    keywords: readonly StoryKeyword[],
    vocabWords: readonly StoryVocabWord[] = [],
  ): WordDetail {
    const base = tapped.base.toLowerCase();

    const keyword = keywords.find(k => k.germanBase.toLowerCase() === base);
    if (keyword) {
      return {
        display: keyword.german,
        base: keyword.germanBase,
        english: keyword.translation,
        article: keyword.article,
        wordType: keyword.wordType,
        plural: this.pluralFor(keyword.cardId),
        cardId: keyword.cardId,
        conjugations: keyword.conjugations ?? null,
      };
    }

    const vocab = vocabWords.find(v => v.germanBase.toLowerCase() === base);
    if (vocab) {
      return {
        display: vocab.german,
        base: vocab.germanBase,
        english: vocab.english,
        article: vocab.article,
        wordType: null,
        plural: this.pluralFor(vocab.cardId),
        cardId: vocab.cardId,
        conjugations: null,
      };
    }

    return {
      display: tapped.base,
      base: tapped.base,
      english: '',
      article: null,
      wordType: null,
      plural: null,
      cardId: null,
      conjugations: null,
    };
  }

  /** True if the word already exists in the user's vault (article+base, then base-only). */
  isInVault(detail: WordDetail): boolean {
    return !!(
      this.dedup.check(detail.article, detail.base) ??
      this.dedup.checkByBackOnly(detail.base)
    );
  }

  /** Speak the word as the vault does: "article base" (e.g. "die Fahrkarte"). */
  playDetail(detail: WordDetail): void {
    const text = detail.article ? `${detail.article} ${detail.base}` : detail.base;
    void this.wordAudio.play(text, 'de-DE');
  }

  /** Speak a keyword row (same normalised cache key as the vault). */
  playKeyword(keyword: StoryKeyword): void {
    const text = keyword.article
      ? `${keyword.article} ${keyword.germanBase}`
      : keyword.germanBase;
    void this.wordAudio.play(text, 'de-DE');
  }

  /**
   * Add the tapped word to the vault. Prompts for a collection first; no-ops if
   * the word is already saved (with a toast) or the user cancels the picker.
   */
  async addToVault(detail: WordDetail): Promise<void> {
    if (this.isInVault(detail)) {
      await this.toast('srs.alreadyInVault', 'success', 2000);
      return;
    }

    const modal = await this.modalCtrl.create({
      component: AssignCollectionSheetComponent,
      componentProps: { selectedCollectionId: null, required: true },
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,
    });
    await modal.present();
    const { data } = await modal.onWillDismiss<{ collectionId: string | null }>();
    if (!data?.collectionId) return; // user cancelled

    // Reuse the global word library: a pure DB lookup (no AI cost) so the saved
    // card inherits canonical examples/synonyms/phonetic/plural/audio when the
    // word already exists. On a miss, fall back to the bare tapped-word detail.
    let entry: WordDictionaryEntry | null = null;
    try {
      entry = (await firstValueFrom(this.dictionary.lookup(detail.base, detail.article))).entry;
    } catch {
      entry = null;
    }

    const userId = this.authService.currentUser()?.id ?? '';
    const now = new Date().toISOString();
    const article = entry?.article ?? detail.article;
    const gender = article ? (GENDER_MAP[article] ?? null) : null;

    this.cardStore
      .createCard({
        deckId: DEFAULT_DECK_ID,
        collectionId: data.collectionId,
        userId,
        contextId: 'german-vocab',
        content: {
          front: detail.display,
          back: entry?.translation || detail.english || detail.display,
          article,
          gender,
          plural: entry?.plurals?.[0] ?? detail.plural,
          examples: entry?.examples ?? [],
          synonyms: entry?.synonyms ?? [],
          notes: '',
          imageUrl: null,
          phonetic: entry?.phonetic ?? null,
          dictionaryWordId: entry?.id ?? null,
        },
        categoryIds: [],
        tags: [],
        createdAt: now,
        updatedAt: now,
        version: 1,
        srsState: {
          id: crypto.randomUUID(),
          cardId: '',
          userId,
          algorithm: 'fsrs',
          intervalDays: 1,
          easeFactor: 2.5,
          repetitions: 0,
          lastRating: null,
          lastReviewedAt: null,
          nextDueAt: now,
          masteryLevel: 0,
          state: 'new',
          stability: null,
          difficulty: null,
          retrievability: null,
        },
      })
      .subscribe({
        next: () => void this.toast('stories.reader.addedToVaultToast', 'success', 2000),
        error: () => void this.toast('stories.reader.saveFailedToast', 'danger', 3000),
      });
  }

  private pluralFor(cardId: string | null): string | null {
    if (!cardId) return null;
    return this.cardStore.cards().find(c => c.id === cardId)?.content?.plural ?? null;
  }

  private async toast(key: string, color: 'success' | 'danger', duration: number): Promise<void> {
    const toast = await this.toastCtrl.create({
      message: this.translate.instant(key),
      duration,
      position: 'bottom',
      color,
    });
    await toast.present();
  }
}
