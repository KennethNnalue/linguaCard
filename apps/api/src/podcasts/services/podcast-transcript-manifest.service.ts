import { Injectable } from '@nestjs/common';
import { In, DataSource } from 'typeorm';
import type {
  AdminPodcastVocabularyAmbiguity,
  AdminPodcastVocabularySelection,
  LanguageCode,
} from '@lingua-card/shared/domain';
import { LexemeIdentityService } from '../../vocabulary/domain/lexeme-identity.service';
import { LexemeEntity } from '../../vocabulary/entities/lexeme.entity';
import { LexemeLocalizationEntity } from '../../vocabulary/entities/lexeme-localization.entity';
import type { LexemeIdentity } from '../../vocabulary/models/vocabulary.types';
import {
  createPodcastTranscriptManifestDraft,
  finalizePodcastTranscriptManifest,
  type PodcastTranscriptManifest,
  type PodcastTranscriptManifestPreparation,
} from '../domain/podcast-transcript-manifest';
import { stableResourceId } from '../../vocabulary/domain/stable-resource-id';

@Injectable()
export class PodcastTranscriptManifestService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly lexemeIdentity: LexemeIdentityService,
  ) {}

  async prepare(
    vocabulary: readonly string[],
    targetLanguage: LanguageCode,
    translationLanguage: LanguageCode,
    selections: readonly AdminPodcastVocabularySelection[] = [],
  ): Promise<PodcastTranscriptManifestPreparation> {
    const draft = createPodcastTranscriptManifestDraft(vocabulary, targetLanguage, translationLanguage);
    const selectionByKey = new Map(selections.map(selection => [selection.key, selection.lexemeId]));
    const identities = draft.items.map(item => this.lexemeIdentity.createIdentity({
      language: targetLanguage,
      text: item.text,
    }));
    const lemmas = [...new Set(identities.map(identity => identity.normalizedLemma))];
    const lexemes = lemmas.length ? await this.dataSource.getRepository(LexemeEntity).find({
      where: { language: targetLanguage, normalizedLemma: In(lemmas) },
    }) : [];
    const localizations = lexemes.length ? await this.dataSource.getRepository(LexemeLocalizationEntity).find({
      where: { lexemeId: In(lexemes.map(lexeme => lexeme.id)), language: translationLanguage, isActive: true },
    }) : [];
    const localizationByLexeme = new Map(localizations.map(localization => [localization.lexemeId, localization]));
    const ambiguities: AdminPodcastVocabularyAmbiguity[] = [];
    const items = draft.items.map((item, index) => {
      const candidates = lexemes.filter(lexeme => lexeme.normalizedLemma === identities[index].normalizedLemma);
      const articleMatches = item.article
        ? candidates.filter(candidate => this.normalize(this.article(candidate)) === item.article)
        : candidates;
      const identityMatches = item.article ? articleMatches : candidates;
      const hasArticleConflict = Boolean(item.article && candidates.length && !articleMatches.length);
      const selectableCandidates = hasArticleConflict ? candidates : identityMatches;
      const translationMatches = item.translation
        ? selectableCandidates.filter(candidate => this.normalize(localizationByLexeme.get(candidate.id)?.translation ?? '')
          === this.normalize(item.translation ?? ''))
        : [];
      const selectedLexemeId = selectionByKey.get(item.key);
      const selectedMatch = selectedLexemeId
        ? selectableCandidates.find(candidate => candidate.id === selectedLexemeId) ?? null
        : null;
      const equivalentCandidates = translationMatches.length > 1
        ? translationMatches
        : item.translation ? [] : selectableCandidates;
      const equivalentMatch = !hasArticleConflict
        && this.areEquivalentCandidates(equivalentCandidates)
        ? this.preferredCandidate(equivalentCandidates)
        : null;
      const match = selectedMatch
        ?? (!hasArticleConflict && translationMatches.length === 1 ? translationMatches[0] : null)
        ?? (!hasArticleConflict && selectableCandidates.length === 1 ? selectableCandidates[0] : null)
        ?? equivalentMatch;
      const localization = match ? localizationByLexeme.get(match.id) : null;
      if (!match && (selectableCandidates.length > 1 || hasArticleConflict)) {
        ambiguities.push(this.ambiguity(item, selectableCandidates, localizationByLexeme));
      }
      return {
        ...item,
        translation: localization?.translation ?? item.translation ?? null,
        canonicalLexemeId: match?.id ?? null,
      };
    });
    return { manifest: finalizePodcastTranscriptManifest(draft, items), ambiguities };
  }

  private areEquivalentCandidates(
    candidates: readonly LexemeEntity[],
  ): boolean {
    return candidates.length > 1
      && new Set(candidates.map(candidate => this.currentIdentityKey(candidate))).size === 1;
  }

  private currentIdentityKey(candidate: LexemeEntity): string {
    const identity = this.currentIdentity(candidate);
    return JSON.stringify([
      identity.language,
      identity.normalizedLemma,
      identity.partOfSpeech,
      identity.grammarDiscriminator,
    ]);
  }

  private currentIdentity(candidate: LexemeEntity): LexemeIdentity {
    return this.lexemeIdentity.createIdentity({
      language: candidate.language,
      text: candidate.displayText,
      partOfSpeech: candidate.partOfSpeech,
      grammar: {
        article: candidate.grammar.article,
        gender: candidate.grammar.gender,
        plurals: candidate.grammar.plurals,
      },
    });
  }

  private preferredCandidate(candidates: readonly LexemeEntity[]): LexemeEntity | null {
    if (!candidates.length) return null;
    const currentIdentityCandidate = candidates.find(candidate => {
      const identity = this.currentIdentity(candidate);
      return candidate.id === stableResourceId(
        'lexeme',
        identity.language,
        identity.normalizedLemma,
        identity.partOfSpeech,
        identity.grammarDiscriminator,
      );
    });
    return currentIdentityCandidate ?? [...candidates].sort((left, right) => left.id.localeCompare(right.id))[0];
  }

  private ambiguity(
    item: PodcastTranscriptManifest['items'][number],
    candidates: readonly LexemeEntity[],
    localizationByLexeme: ReadonlyMap<string, LexemeLocalizationEntity>,
  ): AdminPodcastVocabularyAmbiguity {
    return {
      key: item.key,
      text: item.text,
      article: item.article,
      candidates: [...candidates].sort((left, right) => {
        const leftLocalization = localizationByLexeme.get(left.id);
        const rightLocalization = localizationByLexeme.get(right.id);
        return [this.article(left), left.partOfSpeech, leftLocalization?.translation ?? '', left.id]
          .join('|')
          .localeCompare([this.article(right), right.partOfSpeech, rightLocalization?.translation ?? '', right.id]
            .join('|'));
      }).map(candidate => {
        const localization = localizationByLexeme.get(candidate.id);
        return {
          lexemeId: candidate.id,
          text: candidate.displayText,
          translation: localization?.translation ?? null,
          definition: localization?.definition ?? null,
          partOfSpeech: candidate.partOfSpeech,
          article: this.article(candidate) || null,
        };
      }),
    };
  }

  private article(lexeme: LexemeEntity): string {
    const article = lexeme.grammar['article'];
    return typeof article === 'string' ? article : '';
  }

  private normalize(value: string): string {
    return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
  }
}
