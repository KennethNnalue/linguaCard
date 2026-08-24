import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import type { CardView } from '@lingua-card/shared/domain';
import { WordAudioService } from '../../../../shared/audio/word-audio.service';
import { VocabularyPlayerService } from '../../../listen/services/vocabulary-player.service';
import { DEFAULT_PLAYLIST_LANGUAGES, toVocabularyPlaylistItem } from '../../../listen/models/listen.models';
import { ReviewPlayerService } from '../../../review/services/review-player.service';
import { CardStore } from '../../store/card.store';
import { VaultV2Store } from '../../store/vault-v2.store';
import { CollectionCoverComponent } from '../../components/collection-cover/collection-cover.component';

@Component({
  selector: 'lc-collection-detail-v2',
  templateUrl: './collection-detail-v2.page.html',
  styleUrls: ['./collection-detail-v2.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, CollectionCoverComponent],
})
export class CollectionDetailV2Page implements OnInit {
  readonly store = inject(VaultV2Store);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly wordAudio = inject(WordAudioService);
  private readonly cardStore = inject(CardStore);
  private readonly reviewPlayer = inject(ReviewPlayerService);
  private readonly vocabularyPlayer = inject(VocabularyPlayerService);

  readonly collectionId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly query = signal('');
  readonly collection = computed(() => this.store.vault()?.collections.find(item => item.id === this.collectionId) ?? null);
  readonly cards = computed(() => this.store.learningItems().filter(item => item.collectionIds.includes(this.collectionId)));
  readonly filteredCards = computed(() => {
    const search = this.query().trim().toLocaleLowerCase();
    return search
      ? this.cards().filter(item =>
          item.lexeme.text.toLocaleLowerCase().includes(search)
          || item.localization.translation.toLocaleLowerCase().includes(search))
      : this.cards();
  });
  readonly languagePair = computed(() => {
    const context = this.store.vault()?.learningContext;
    if (!context) return '';
    return `${this.languageName(context.sourceLanguage)} → ${this.languageName(context.targetLanguage)}`;
  });

  ngOnInit(): void {
    this.store.loadActiveVault();
  }

  goBack(): void {
    void this.router.navigate(['/vault']);
  }

  updateQuery(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.query.set(target.value);
  }

  playWord(item: CardView): void {
    const language = this.store.vault()?.learningContext.targetLanguage ?? 'de';
    const locales: Record<string, string> = { de: 'de-DE', en: 'en-US', es: 'es-ES', ar: 'ar-SA' };
    void this.wordAudio.play(item.lexeme.text, locales[language] ?? language);
  }

  startReview(): void {
    const cards = this.legacyCards();
    if (cards.length > 0) void this.reviewPlayer.open(cards, { kind: 'collection', collectionId: this.collectionId });
  }

  startListen(): void {
    const collection = this.collection();
    const cards = this.legacyCards();
    if (!collection || cards.length === 0) return;
    void this.vocabularyPlayer.open({
      playlistId: `collection:${collection.id}`,
      title: collection.name,
      source: { kind: 'collection', collectionId: collection.id },
      languages: DEFAULT_PLAYLIST_LANGUAGES,
      items: cards.map(toVocabularyPlaylistItem),
    });
  }

  private legacyCards() {
    return this.cardStore.cards().filter(card => card.collectionId === this.collectionId);
  }

  private languageName(code: string): string {
    const names: Record<string, string> = { en: 'English', de: 'German', ar: 'Arabic', es: 'Spanish' };
    return names[code] ?? code;
  }
}
