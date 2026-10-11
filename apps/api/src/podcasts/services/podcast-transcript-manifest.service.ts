import { BadRequestException, ConflictException, NotFoundException, Injectable } from '@nestjs/common';
import { In, DataSource } from 'typeorm';
import type {
  AdminPodcastVocabularyResolutionCandidate,
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
import { hasBalancedVocabularyParentheses } from '../domain/podcast-transcript-prompt';
import { createHash } from 'node:crypto';
import { PodcastEpisodeEntity } from '../entities/podcast-episode.entity';
import { PodcastTopicEntity } from '../entities/podcast-topic.entity';
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
    if (vocabulary.some(item => !hasBalancedVocabularyParentheses(item))) {
      throw new BadRequestException('Complete parenthetical vocabulary notes and keep examples separate from headwords.');
    }
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
      const hasTranslationConflict = Boolean(item.translation && selectableCandidates.length
        && !translationMatches.length);
      const selectedLexemeId = selectionByKey.get(item.key);
      const selectedMatch = selectedLexemeId
        ? selectableCandidates.find(candidate => candidate.id === selectedLexemeId) ?? null
        : null;
      const equivalentCandidates = translationMatches.length > 1
        ? translationMatches
        : item.translation ? [] : selectableCandidates;
      const equivalentMatch = !hasArticleConflict && !hasTranslationConflict
        && this.haveCompatibleTranslations(equivalentCandidates, localizationByLexeme)
        && this.areEquivalentCandidates(equivalentCandidates)
        ? this.preferredCandidate(equivalentCandidates)
        : null;
      const specificGrammarMatch = !hasArticleConflict && !hasTranslationConflict
        && this.haveCompatibleTranslations(selectableCandidates, localizationByLexeme)
        ? this.preferredSpecificGrammarCandidate(selectableCandidates)
        : null;
      const match = selectedMatch
        ?? (!hasArticleConflict && translationMatches.length === 1 ? translationMatches[0] : null)
        ?? (!hasArticleConflict && !hasTranslationConflict && selectableCandidates.length === 1 ? selectableCandidates[0] : null)
        ?? equivalentMatch
        ?? specificGrammarMatch;
      const localization = match ? localizationByLexeme.get(match.id) : null;
      if (!match && (selectableCandidates.length > 1 || hasArticleConflict || hasTranslationConflict)) {
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

  /** Create an independent, explicitly authored meaning. Existing cards are never updated. */
  async createSense(episodeId: string, key: string, translation: string): Promise<AdminPodcastVocabularyResolutionCandidate> {
    const meaning = translation.normalize('NFC').trim().replace(/\s+/gu, ' ');
    if (!meaning || meaning.length > 500) throw new BadRequestException('Enter a meaning of up to 500 characters.');
    return this.dataSource.transaction(async manager => {
      const episode = await manager.findOne(PodcastEpisodeEntity, {
        where: { id: episodeId }, lock: { mode: 'pessimistic_write' },
      });
      if (!episode) throw new NotFoundException('Episode not found');
      if (episode.status !== 'draft' || episode.audioGenerationStatus === 'generating') {
        throw new ConflictException('Add meanings only to an editable draft.');
      }
      const topic = await manager.findOneBy(PodcastTopicEntity, { id: episode.topicId });
      if (!topic) throw new NotFoundException('Topic not found');
      const draft = createPodcastTranscriptManifestDraft(episode.generationInput?.vocabulary ?? [],
        topic.targetLanguage, topic.translationLanguage);
      const item = draft.items.find(entry => entry.key === key);
      if (!item) throw new BadRequestException('Save the vocabulary entry before adding its meaning.');
      const senseKey = createHash('sha256').update(JSON.stringify([
        topic.translationLanguage, this.normalize(meaning),
      ])).digest('hex');
      const partOfSpeech = item.article ? 'noun' : 'other';
      const grammar = { article: item.article, gender: null, plurals: [], senseKey };
      const identity = this.lexemeIdentity.createIdentity({ language: topic.targetLanguage,
        text: item.text, partOfSpeech, grammar });
      const lexemeId = stableResourceId('lexeme', identity.language, identity.normalizedLemma,
        identity.partOfSpeech, identity.grammarDiscriminator);
      await manager.getRepository(LexemeEntity).createQueryBuilder().insert().values({
        id: lexemeId, language: identity.language, normalizedLemma: identity.normalizedLemma,
        displayText: identity.displayText, partOfSpeech, grammarDiscriminator: identity.grammarDiscriminator,
        grammar, phonetic: null, cefrLevel: topic.level, source: 'admin', model: null,
      }).orIgnore().execute();
      await manager.getRepository(LexemeLocalizationEntity).createQueryBuilder().insert().values({
        id: stableResourceId('lexeme-localization', lexemeId, topic.translationLanguage, '1'),
        lexemeId, language: topic.translationLanguage, translation: meaning, definition: null,
        synonyms: [], status: 'ready', contentVersion: 1, isActive: true, source: 'admin', model: null,
      }).orIgnore().execute();
      const localization = await manager.getRepository(LexemeLocalizationEntity).findOneBy({
        lexemeId, language: topic.translationLanguage, isActive: true,
      });
      if (!localization || this.normalize(localization.translation) !== this.normalize(meaning)) {
        throw new ConflictException('This meaning already exists with different content. Review the dictionary entry.');
      }
      return { lexemeId, text: item.text, translation: localization.translation,
        definition: localization.definition, partOfSpeech, article: item.article };
    });
  }

  private haveCompatibleTranslations(
    candidates: readonly LexemeEntity[],
    localizations: ReadonlyMap<string, LexemeLocalizationEntity>,
  ): boolean {
    const translations = candidates.map(candidate => localizations.get(candidate.id)?.translation)
      .filter((translation): translation is string => Boolean(translation))
      .map(translation => this.normalize(translation));
    return new Set(translations).size <= 1;
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
        senseKey: candidate.grammar.senseKey,
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

  private preferredSpecificGrammarCandidate(candidates: readonly LexemeEntity[]): LexemeEntity | null {
    const specificCandidates = candidates.filter(candidate => candidate.partOfSpeech !== 'other');
    if (specificCandidates.length !== 1) return null;
    return candidates.every(candidate => candidate === specificCandidates[0] || candidate.partOfSpeech === 'other')
      ? specificCandidates[0]
      : null;
  }

  private ambiguity(
    item: PodcastTranscriptManifest['items'][number],
    candidates: readonly LexemeEntity[],
    localizationByLexeme: ReadonlyMap<string, LexemeLocalizationEntity>,
  ): AdminPodcastVocabularyAmbiguity {
    return {
      key: item.key,
      suppliedTranslation: item.translation,
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
