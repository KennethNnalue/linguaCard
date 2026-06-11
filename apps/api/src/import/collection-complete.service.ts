import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import type {
  CardContent,
  ExampleSentence,
  GenderType,
  RawExtractedWord,
  RawWordInput,
  SRSStateData,
  WordDictionaryEntry,
} from '@lingua-card/shared/domain';
import { CollectionEntity } from '../collections/collection.entity';
import { CardEntity } from '../cards/card.entity';
import { WordDedupService } from '../cards/word-dedup.service';
import { WordAudioService } from '../word-audio/word-audio.service';
import { SynonymAudioPrefetchService } from '../word-audio/synonym-audio-prefetch.service';
import { WordDictionaryService } from '../word-dictionary/word-dictionary.service';

@Injectable()
export class CollectionCompleteService {
  private readonly logger = new Logger(CollectionCompleteService.name);

  constructor(
    private readonly dictionary: WordDictionaryService,
    private readonly wordDedup: WordDedupService,
    private readonly wordAudio: WordAudioService,
    private readonly synonymAudioPrefetch: SynonymAudioPrefetchService,
    @InjectRepository(CollectionEntity)
    private readonly collectionRepo: Repository<CollectionEntity>,
    @InjectRepository(CardEntity)
    private readonly cardRepo: Repository<CardEntity>,
  ) {}

  async resume(userId: string, collectionId: string): Promise<{
    newCards: number;
    reusedCards: number;
    pendingWords: RawExtractedWord[];
    isComplete: boolean;
  }> {
    const collection = await this.collectionRepo.findOneBy({ id: collectionId, userId });
    if (!collection) throw new NotFoundException('Collection not found');

    if (collection.importStatus === 'complete') {
      return { newCards: 0, reusedCards: 0, pendingWords: [], isComplete: true };
    }

    const pending = (collection.pendingWords ?? []) as RawExtractedWord[];
    if (pending.length === 0) {
      collection.importStatus = 'complete';
      await this.collectionRepo.save(collection);
      return { newCards: 0, reusedCards: 0, pendingWords: [], isComplete: true };
    }

    const raws: RawWordInput[] = pending.map(w => ({
      back: w.back,
      article: (w.article as 'der' | 'die' | 'das' | null) ?? null,
    }));

    const { entries, reused, enriched: newCount } = await this.dictionary.batchResolve(
      raws,
      'de-DE',
      'en',
    );

    this.logger.log(
      `resume(${collectionId}): ${reused} reused from dictionary, ${newCount} newly enriched`,
    );

    const dupResults = await this.wordDedup.findDuplicatesByBackOnly(
      userId,
      entries.map(e => ({ back: e.displayText })),
    );

    let newCards = 0;
    let reusedCards = 0;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const existing = dupResults[i];

      if (existing) {
        try {
          await this.cardRepo.update({ id: existing.id, userId }, { collectionId });
          reusedCards++;
        } catch (err) {
          this.logger.warn(`Failed to reassign duplicate card ${existing.id}`, err);
        }
      } else {
        try {
          await this.createCard(userId, collectionId, entry);
          newCards++;
        } catch (err) {
          this.logger.error('Failed to create card during resume', err);
        }
      }
    }

    collection.pendingWords = [];
    collection.importStatus = 'complete';
    await this.collectionRepo.save(collection);

    if (entries.length > 0) {
      const primaryAudio: { text: string; language: string }[] = [];
      const secondaryAudio: { text: string; language: string }[] = [];

      for (const entry of entries) {
        primaryAudio.push({
          text: (entry.article ? `${entry.article} ` : '') + entry.displayText,
          language: 'de-DE',
        });
        if (entry.examples[0]?.target) {
          primaryAudio.push({ text: entry.examples[0].target, language: 'de-DE' });
        }
        if (entry.plurals[0]) {
          secondaryAudio.push({ text: entry.plurals[0], language: 'de-DE' });
        }
        for (const syn of (entry.synonyms ?? [])) {
          if (syn.example) secondaryAudio.push({ text: syn.example, language: 'de-DE' });
        }
      }

      this.wordAudio.batchResolve(primaryAudio).catch(err =>
        this.logger.warn('Primary audio pre-generation failed', err),
      );
      if (secondaryAudio.length > 0) {
        this.synonymAudioPrefetch.enqueue(secondaryAudio);
      }
    }

    return {
      newCards,
      reusedCards,
      pendingWords: [],
      isComplete: true,
    };
  }

  private async createCard(userId: string, collectionId: string, entry: WordDictionaryEntry): Promise<void> {
    const now = new Date().toISOString();
    const gender: GenderType =
      entry.article === 'der' ? 'masculine' :
      entry.article === 'die' ? 'feminine' :
      entry.article === 'das' ? 'neuter' : null;

    const examples: ExampleSentence[] = entry.examples.length
      ? entry.examples
      : [];

    const content: CardContent = {
      front: entry.translation,
      back: entry.displayText,
      article: entry.article,
      gender,
      plural: entry.plurals[0] ?? null,
      examples,
      synonyms: entry.synonyms ?? [],
      notes: '',
      imageUrl: null,
      phonetic: entry.phonetic,
      dictionaryWordId: entry.id,
    };

    const srsState: SRSStateData = {
      id: randomUUID(),
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
    };

    const entity = this.cardRepo.create({
      id: randomUUID(),
      deckId: 'deck-001',
      collectionId,
      userId,
      contextId: 'german-vocab',
      content,
      categoryIds: [],
      tags: [],
      version: 1,
      srsState,
    });

    await this.cardRepo.save(entity);
  }
}
