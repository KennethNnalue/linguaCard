import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import type {
  CardContent,
  ExampleSentence,
  GenderType,
  ImageExtractedWord,
  RawExtractedWord,
  SRSStateData,
} from '@lingua-card/shared/domain';
import { CollectionEntity } from '../collections/collection.entity';
import { CardEntity } from '../cards/card.entity';
import { WordEnrichService } from './word-enrich.service';
import { WordDedupService } from '../cards/word-dedup.service';
import { WordAudioService } from '../word-audio/word-audio.service';
import { SynonymAudioPrefetchService } from '../word-audio/synonym-audio-prefetch.service';

@Injectable()
export class CollectionCompleteService {
  private readonly logger = new Logger(CollectionCompleteService.name);

  constructor(
    private readonly wordEnrich: WordEnrichService,
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

    const result = await this.wordEnrich.enrichWords({
      rawWords: pending,
      targetLanguage: 'de',
      nativeLanguage: 'en',
      collectionId,
    });

    // Dedup all enriched words against the user's existing cards in one query.
    // Use back-only matching because:
    // 1. Phase 1 extraction embeds the article in back ("der Hund" not "Hund")
    // 2. The enrichment prompt echoes back the original back value unchanged
    // So enriched.back may be "der Hund" while the vault card has back="Hund", article="der"
    // A word-only match is sufficient and avoids false negatives from article mismatches.
    const dupResults = await this.wordDedup.findDuplicatesByBackOnly(
      userId,
      result.enriched.map(w => ({ back: w.back })),
    );

    let newCards = 0;
    let reusedCards = 0;

    for (let i = 0; i < result.enriched.length; i++) {
      const word = result.enriched[i];
      const existing = dupResults[i];

      if (existing) {
        // Card already exists — reassign its collectionId rather than duplicating it.
        // Preserves the original card's SRS state, audio, and all metadata.
        try {
          await this.cardRepo.update(
            { id: existing.id, userId },
            { collectionId },
          );
          reusedCards++;
        } catch (err) {
          this.logger.warn(`Failed to reassign duplicate card ${existing.id}`, err);
        }
      } else {
        try {
          await this.createCard(userId, collectionId, word);
          newCards++;
        } catch (err) {
          this.logger.error('Failed to create card during resume', err);
        }
      }
    }

    collection.pendingWords = result.pending;
    collection.importStatus = result.isComplete ? 'complete' : 'incomplete';
    await this.collectionRepo.save(collection);

    // Fire-and-forget audio pre-generation — runs after the HTTP response is sent.
    // Primary audio (word + main example): fired immediately via batchResolve so
    // the user hears audio on first tap into the vault.
    // Secondary audio (plural + synonym examples): queued in the throttled
    // SynonymAudioPrefetchService to avoid spiking TTS quota on large imports.
    if (result.enriched.length > 0) {
      const primaryAudio: { text: string; language: string }[] = [];
      const secondaryAudio: { text: string; language: string }[] = [];

      for (const word of result.enriched) {
        primaryAudio.push({
          text: (word.article ? `${word.article} ` : '') + word.back,
          language: 'de-DE',
        });
        if (word.exampleTarget) {
          primaryAudio.push({ text: word.exampleTarget, language: 'de-DE' });
        }
        if (word.plural) {
          secondaryAudio.push({ text: word.plural, language: 'de-DE' });
        }
        for (const syn of (word.synonyms ?? [])) {
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
      pendingWords: result.pending,
      isComplete: result.isComplete,
    };
  }

  private async createCard(userId: string, collectionId: string, word: ImageExtractedWord): Promise<void> {
    const now = new Date().toISOString();
    const gender: GenderType =
      word.article === 'der' ? 'masculine' :
      word.article === 'die' ? 'feminine' :
      word.article === 'das' ? 'neuter' : null;

    const examples: ExampleSentence[] = word.exampleTarget
      ? [{ id: randomUUID(), target: word.exampleTarget, native: word.exampleNative }]
      : [];

    const content: CardContent = {
      front: word.front,
      back: word.back,
      article: word.article,
      gender,
      plural: word.plural ?? null,
      examples,
      synonyms: word.synonyms ?? [],
      notes: '',
      audioAssetId: null,
      imageUrl: null,
      phonetic: null,
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
