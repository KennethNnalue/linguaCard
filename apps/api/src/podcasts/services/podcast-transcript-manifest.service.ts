import { Injectable } from '@nestjs/common';
import { In, DataSource } from 'typeorm';
import type { LanguageCode } from '@lingua-card/shared/domain';
import { LexemeIdentityService } from '../../vocabulary/domain/lexeme-identity.service';
import { LexemeEntity } from '../../vocabulary/entities/lexeme.entity';
import { LexemeLocalizationEntity } from '../../vocabulary/entities/lexeme-localization.entity';
import {
  createPodcastTranscriptManifestDraft,
  finalizePodcastTranscriptManifest,
  type PodcastTranscriptManifest,
} from '../domain/podcast-transcript-manifest';

@Injectable()
export class PodcastTranscriptManifestService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly lexemeIdentity: LexemeIdentityService,
  ) {}

  async create(
    vocabulary: readonly string[],
    targetLanguage: LanguageCode,
    translationLanguage: LanguageCode,
  ): Promise<PodcastTranscriptManifest> {
    const draft = createPodcastTranscriptManifestDraft(vocabulary, targetLanguage, translationLanguage);
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
    const items = draft.items.map((item, index) => {
      const candidates = lexemes.filter(lexeme => lexeme.normalizedLemma === identities[index].normalizedLemma);
      const articleMatches = item.article
        ? candidates.filter(candidate => this.normalize(this.article(candidate)) === item.article)
        : candidates;
      const identityMatches = item.article ? articleMatches : candidates;
      const translationMatches = item.translation
        ? identityMatches.filter(candidate => this.normalize(localizationByLexeme.get(candidate.id)?.translation ?? '')
          === this.normalize(item.translation ?? ''))
        : [];
      const match = translationMatches.length === 1
        ? translationMatches[0]
        : identityMatches.length === 1 ? identityMatches[0] : null;
      const localization = match ? localizationByLexeme.get(match.id) : null;
      return {
        ...item,
        translation: item.translation ?? localization?.translation ?? null,
        canonicalLexemeId: match?.id ?? null,
      };
    });
    return finalizePodcastTranscriptManifest(draft, items);
  }

  private article(lexeme: LexemeEntity): string {
    const article = lexeme.grammar['article'];
    return typeof article === 'string' ? article : '';
  }

  private normalize(value: string): string {
    return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
  }
}
