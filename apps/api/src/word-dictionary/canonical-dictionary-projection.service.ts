import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, In, QueryFailedError } from 'typeorm';
import type { ExampleSentence, Synonym } from '@lingua-card/shared/domain';
import { WordAudioService } from '../word-audio/word-audio.service';
import { LegacyDictionaryLexemeEntity } from '../vocabulary/entities/legacy-dictionary-lexeme.entity';
import type { LexemeEntity } from '../vocabulary/entities/lexeme.entity';
import type { LexemeLocalizationEntity } from '../vocabulary/entities/lexeme-localization.entity';
import { normalizeLemma } from './normalize-lemma';
import { WordDictionaryEntity } from './word-dictionary.entity';

export interface CanonicalDictionaryExample {
  target: string;
  native: string;
}

export interface CanonicalDictionaryProjectionInput {
  lexeme: LexemeEntity;
  localization: LexemeLocalizationEntity;
  targetLocale: string;
  examples: readonly CanonicalDictionaryExample[];
}

export interface CanonicalDictionaryProjectionResult {
  dictionaryWordId: string;
  reused: boolean;
  audio: 'reused' | 'generated';
}

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class CanonicalDictionaryProjectionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly wordAudio: WordAudioService,
  ) {}

  async project(input: CanonicalDictionaryProjectionInput): Promise<CanonicalDictionaryProjectionResult> {
    const results = await this.projectMany([input]);
    return results[0];
  }

  async projectMany(
    inputs: readonly CanonicalDictionaryProjectionInput[],
  ): Promise<CanonicalDictionaryProjectionResult[]> {
    if (!inputs.length) return [];
    const dictionaryRepo = this.dataSource.getRepository(WordDictionaryEntity);
    const mappingRepo = this.dataSource.getRepository(LegacyDictionaryLexemeEntity);
    const descriptors = inputs.map(input => {
      const article = this.article(input.lexeme);
      return {
        input,
        article,
        lemmaKey: normalizeLemma(input.lexeme.displayText, article),
      };
    });
    const identityKeys = descriptors.map(item => this.dictionaryIdentityKey(
      item.lemmaKey,
      item.input.targetLocale,
      item.input.localization.language,
    ));
    if (new Set(identityKeys).size !== identityKeys.length) {
      throw new ConflictException('Essential vocabulary resolves to duplicate dictionary entries');
    }
    const existingWords = await dictionaryRepo.find({
      where: descriptors.map(item => ({
        lemmaKey: item.lemmaKey,
        targetLang: item.input.targetLocale,
        nativeLang: item.input.localization.language,
      })),
    });
    const dictionaryByIdentity = new Map(existingWords.map(word => [
      this.dictionaryIdentityKey(word.lemmaKey, word.targetLang, word.nativeLang),
      word,
    ]));
    const resolvedWords: Array<{ word: WordDictionaryEntity; reused: boolean }> = [];
    for (let index = 0; index < descriptors.length; index += 1) {
      const descriptor = descriptors[index];
      let word = dictionaryByIdentity.get(identityKeys[index]);
      let reused = word !== undefined;
      if (!word) {
        word = dictionaryRepo.create(this.dictionaryValues(
          descriptor.input,
          descriptor.lemmaKey,
          descriptor.article,
        ));
        try {
          word = await dictionaryRepo.save(word);
        } catch (error) {
          if (!this.isUniqueViolation(error)) throw error;
          word = await dictionaryRepo.findOneBy({
            lemmaKey: descriptor.lemmaKey,
            targetLang: descriptor.input.targetLocale,
            nativeLang: descriptor.input.localization.language,
          }) ?? undefined;
          if (!word) throw error;
          reused = true;
        }
      }
      resolvedWords.push({ word, reused });
    }

    const mappings = await mappingRepo.findBy({
      dictionaryWordId: In(resolvedWords.map(item => item.word.id)),
    });
    const mappingByDictionaryId = new Map(mappings.map(mapping => [mapping.dictionaryWordId, mapping]));
    for (let index = 0; index < resolvedWords.length; index += 1) {
      const dictionaryWord = resolvedWords[index].word;
      const input = descriptors[index].input;
      const existingMapping = mappingByDictionaryId.get(dictionaryWord.id);
      if (existingMapping && existingMapping.lexemeId !== input.lexeme.id) {
        throw new ConflictException(
          `Dictionary word ${dictionaryWord.id} is linked to a different canonical lexeme`,
        );
      }
      if (existingMapping) continue;
      try {
        await mappingRepo.save(mappingRepo.create({
          dictionaryWordId: dictionaryWord.id,
          lexemeId: input.lexeme.id,
        }));
      } catch (error) {
        if (!this.isUniqueViolation(error)) throw error;
        const winningMapping = await mappingRepo.findOneBy({ dictionaryWordId: dictionaryWord.id });
        if (!winningMapping || winningMapping.lexemeId !== input.lexeme.id) {
          throw new ConflictException(
            `Dictionary word ${dictionaryWord.id} is linked to a different canonical lexeme`,
          );
        }
      }
    }

    const audio = await this.wordAudio.batchResolve(resolvedWords.map((item, index) => ({
      text: this.spokenText(item.word),
      language: descriptors[index].input.targetLocale,
    })));
    if (audio.results.length !== resolvedWords.length) {
      throw new ServiceUnavailableException('Vocabulary audio resolution returned an incomplete result');
    }
    const changedWords: WordDictionaryEntity[] = [];
    const results: CanonicalDictionaryProjectionResult[] = [];
    for (let index = 0; index < resolvedWords.length; index += 1) {
      const resolvedAudio = audio.results[index];
      const dictionaryWord = resolvedWords[index].word;
      if (resolvedAudio.wordAudio.status !== 'ready' || !resolvedAudio.wordAudio.id) {
        throw new ServiceUnavailableException(`Audio for ${dictionaryWord.displayText} is not ready`);
      }
      if (dictionaryWord.wordAudioId !== resolvedAudio.wordAudio.id) {
        dictionaryWord.wordAudioId = resolvedAudio.wordAudio.id;
        changedWords.push(dictionaryWord);
      }
      results.push({
        dictionaryWordId: dictionaryWord.id,
        reused: resolvedWords[index].reused,
        audio: resolvedAudio.cached ? 'reused' : 'generated',
      });
    }
    if (changedWords.length) await dictionaryRepo.save(changedWords);
    return results;
  }

  private dictionaryValues(
    input: CanonicalDictionaryProjectionInput,
    lemmaKey: string,
    article: 'der' | 'die' | 'das' | null,
  ): Omit<WordDictionaryEntity, 'enrichedAt' | 'updatedAt'> {
    return {
      id: randomUUID(),
      lemmaKey,
      targetLang: input.targetLocale,
      nativeLang: input.localization.language,
      displayText: input.lexeme.displayText,
      article,
      gender: this.gender(input.lexeme),
      translation: input.localization.translation,
      wordType: this.wordType(input.lexeme.partOfSpeech),
      phonetic: input.lexeme.phonetic,
      cefrLevel: this.cefrLevel(input.lexeme.cefrLevel),
      categoryName: 'Podcast',
      examples: input.examples.map(example => this.example(example)),
      synonyms: input.localization.synonyms.map(synonym => this.synonym(synonym)),
      plurals: [...input.lexeme.grammar.plurals],
      wordAudioId: null,
      source: 'admin',
      model: 'podcast-platform-collection',
    };
  }

  private spokenText(dictionaryWord: WordDictionaryEntity): string {
    return dictionaryWord.article
      ? `${dictionaryWord.article} ${dictionaryWord.displayText}`
      : dictionaryWord.displayText;
  }

  private dictionaryIdentityKey(lemmaKey: string, targetLang: string, nativeLang: string): string {
    return `${targetLang}:${nativeLang}:${lemmaKey}`;
  }

  private article(lexeme: LexemeEntity): 'der' | 'die' | 'das' | null {
    const value = lexeme.grammar.article;
    return value === 'der' || value === 'die' || value === 'das' ? value : null;
  }

  private gender(lexeme: LexemeEntity): 'masculine' | 'feminine' | 'neuter' | null {
    const value = lexeme.grammar.gender;
    return value === 'masculine' || value === 'feminine' || value === 'neuter' ? value : null;
  }

  private wordType(value: string): WordDictionaryEntity['wordType'] {
    return value === 'noun' || value === 'verb' || value === 'adjective' || value === 'adverb'
      ? value
      : 'other';
  }

  private cefrLevel(value: string | null): WordDictionaryEntity['cefrLevel'] {
    return value === 'A1' || value === 'A2' || value === 'B1' || value === 'B2' || value === 'C1'
      ? value
      : null;
  }

  private example(value: CanonicalDictionaryExample): ExampleSentence {
    return { id: randomUUID(), target: value.target, native: value.native };
  }

  private synonym(value: LexemeLocalizationEntity['synonyms'][number]): Synonym {
    return {
      word: value.word,
      article: this.synonymArticle(value.article),
      translation: value.translation,
      example: value.example ?? '',
      exampleNative: value.exampleNative ?? '',
    };
  }

  private synonymArticle(value: string | null | undefined): 'der' | 'die' | 'das' | null {
    return value === 'der' || value === 'die' || value === 'das' ? value : null;
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof QueryFailedError
      && typeof error.driverError === 'object'
      && error.driverError !== null
      && 'code' in error.driverError
      && error.driverError.code === PG_UNIQUE_VIOLATION;
  }
}
