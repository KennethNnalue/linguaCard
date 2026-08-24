import { Injectable } from '@nestjs/common';
import type { LexemeIdentity, LexemeIdentityInput } from '../models/vocabulary.types';
import { canonicalizeLanguageCode } from './language-code';

const GERMAN_ARTICLES = new Set(['der', 'die', 'das']);

@Injectable()
export class LexemeIdentityService {
  createIdentity(input: LexemeIdentityInput): LexemeIdentity {
    const language = canonicalizeLanguageCode(input.language);
    const displayText = this.collapseWhitespace(input.text.normalize('NFC'));
    if (!displayText) throw new Error('Lexeme text is required');

    const partOfSpeech = this.normalizePartOfSpeech(input.partOfSpeech);
    const normalizedWithPossibleArticle = displayText.toLocaleLowerCase(language);
    const parsed = language === 'de'
      ? this.parseGermanArticle(normalizedWithPossibleArticle)
      : { lemma: normalizedWithPossibleArticle, article: null };
    const normalizedLemma = this.trimBoundaryPunctuation(parsed.lemma);
    if (!normalizedLemma) throw new Error('Lexeme text must contain letters or numbers');

    return {
      language,
      normalizedLemma,
      displayText: language === 'de' && parsed.article
        ? displayText.slice(parsed.article.length).trim()
        : displayText,
      partOfSpeech,
      grammarDiscriminator: this.grammarDiscriminator(
        language,
        partOfSpeech,
        input.grammar ?? {},
        parsed.article,
      ),
    };
  }

  private collapseWhitespace(value: string): string {
    return value.trim().replace(/\s+/gu, ' ');
  }

  private trimBoundaryPunctuation(value: string): string {
    return value.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '').trim();
  }

  private normalizePartOfSpeech(value: string | undefined): string {
    return value?.trim().toLowerCase() || 'other';
  }

  private parseGermanArticle(value: string): { lemma: string; article: string | null } {
    const firstSpace = value.indexOf(' ');
    if (firstSpace < 0) return { lemma: value, article: null };
    const candidate = value.slice(0, firstSpace);
    if (!GERMAN_ARTICLES.has(candidate)) return { lemma: value, article: null };
    return { lemma: value.slice(firstSpace + 1).trim(), article: candidate };
  }

  private grammarDiscriminator(
    language: string,
    partOfSpeech: string,
    grammar: Readonly<Record<string, unknown>>,
    parsedArticle: string | null,
  ): string {
    if (language !== 'de' || partOfSpeech !== 'noun') return '';
    const article = this.readGermanArticle(grammar['article']) ?? parsedArticle ?? '';
    const gender = this.readString(grammar['gender']);
    return `article=${article};gender=${gender}`;
  }

  private readGermanArticle(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return GERMAN_ARTICLES.has(normalized) ? normalized : null;
  }

  private readString(value: unknown): string {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  }
}
