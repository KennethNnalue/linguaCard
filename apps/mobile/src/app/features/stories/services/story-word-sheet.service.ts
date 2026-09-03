import { AppNotificationService } from '@lingua-card/mobile/notifications';
import { inject, Injectable } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
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
  private readonly toastCtrl = inject(AppNotificationService);
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
    dictEntry: WordDictionaryEntry | null = null,
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

    // Plain (non-vocab) word: use the dictionary DB entry when one was found.
    if (dictEntry) {
      return {
        display: dictEntry.article ? `${dictEntry.article} ${dictEntry.displayText}` : dictEntry.displayText,
        base: dictEntry.displayText,
        english: dictEntry.translation,
        article: dictEntry.article,
        wordType: dictEntry.wordType,
        plural: dictEntry.plurals?.[0] ?? null,
        cardId: null,
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
  async addToVault(detail: WordDetail): Promise<boolean> {
    if (this.isInVault(detail)) {
      await this.toast('srs.alreadyInVault', 'success', 2000);
      return true;
    }

    const modal = await this.modalCtrl.create({
      component: AssignCollectionSheetComponent,
      componentProps: { selectedCollectionId: null, required: true },
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,
    });
    await modal.present();
    const { data } = await modal.onWillDismiss<{ collectionId: string | null }>();
    if (!data?.collectionId) return false;

    // Reuse the global word library so the saved card inherits canonical
    // examples/synonyms/phonetic/plural/audio. batchLookup returns the existing
    // entry for free (DB hit) and only spends AI to enrich a genuine miss — which
    // is exactly when the user has chosen to save a word we don't yet have.
    let entry: WordDictionaryEntry | null = null;
    try {
      const result = await firstValueFrom(
        this.dictionary.batchLookup([{ back: detail.base, article: detail.article }]),
      );
      entry = result.entries[0] ?? null;
    } catch {
      entry = null;
    }

    const userId = this.authService.currentUser()?.id ?? '';
    const now = new Date().toISOString();
    const article = entry?.article ?? detail.article;
    const gender = article ? (GENDER_MAP[article] ?? null) : null;

    try {
      await firstValueFrom(this.cardStore.createCard({
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
      }));
      await this.toast('stories.reader.addedToVaultToast', 'success', 2000);
      return true;
    } catch {
      await this.toast('stories.reader.saveFailedToast', 'danger', 3000);
      return false;
    }
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
