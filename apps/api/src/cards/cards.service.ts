import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import type { CardContent, GenderType, ScheduledCard } from '@lingua-card/shared/domain';
import type { CreateCardDto, UpdateCardDto, CardQueryParams } from '@lingua-card/shared/dto';
import { CardEntity } from './card.entity';
import { WordAudioService } from '../word-audio/word-audio.service';
import { SubscriptionService } from '../subscriptions/subscription.service';
import { ShareSyncService } from '../shares/share-sync.service';
import { createNewReviewScheduling } from '../review/review-scheduling.entity';
import { LearningItemReadService } from '../learning-items/services/learning-item-read.service';
import { canonicalCardToScheduledCard } from './canonical-card.mapper';

@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(
    @InjectRepository(CardEntity)
    private readonly repo: Repository<CardEntity>,
    private readonly learningItems: LearningItemReadService,
    @Optional() private readonly wordAudioService?: WordAudioService,
    @Optional() private readonly subscriptions?: SubscriptionService,
    @Optional() private readonly syncService?: ShareSyncService,
  ) {}

  async findAll(userId: string, query: CardQueryParams): Promise<ScheduledCard[]> {
    const context = await this.learningItems.loadActiveLearningContext(userId);
    const canonicalCards: ScheduledCard[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.learningItems.listLearningItems({
        userId,
        learningContextId: context.id,
        collectionId: query.collectionId,
        cursor,
        limit: 100,
      });
      canonicalCards.push(...page.items.map(card => canonicalCardToScheduledCard(userId, card)));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    return canonicalCards
      .filter(card => !query.state || card.reviewState.stage === query.state)
      .filter(card => !query.categoryId || card.categoryIds.includes(query.categoryId));
  }

  async findOne(userId: string, id: string): Promise<ScheduledCard> {
    const entity = await this.repo.findOneBy({ id, userId });
    if (!entity) throw new NotFoundException(`Card ${id} not found`);
    return this.toModel(entity);
  }

  async create(userId: string, dto: CreateCardDto): Promise<ScheduledCard> {
    const now = new Date().toISOString();
    const cardId = randomUUID();
    const entity = this.repo.create({
      id: cardId,
      deckId: dto.deckId,
      collectionId: dto.collectionId ?? null,
      dictionaryWordId: dto.content.dictionaryWordId ?? null,
      userId,
      contextId: dto.contextId,
      content: {
        front: dto.content.front,
        back: dto.content.back,
        article: dto.content.article ?? null,
        gender: (dto.content.gender ?? null) as GenderType,
        plural: dto.content.plural ?? null,
        examples: (dto.content.examples ?? []).map(e => ({ id: randomUUID(), ...e })),
        synonyms: (dto.content.synonyms ?? []).map(s => ({
          word: s.word,
          article: s.article ?? null,
          translation: s.translation,
          example: s.example ?? '',
          exampleNative: s.exampleNative ?? '',
        })),
        notes: dto.content.notes ?? '',
        imageUrl: dto.content.imageUrl ?? null,
        phonetic: dto.content.phonetic ?? null,
      } satisfies CardContent,
      categoryIds: dto.categoryIds ?? [],
      tags: dto.tags ?? [],
      version: 1,
      scheduling: createNewReviewScheduling(cardId),
    });
    const saved = await this.repo.save(entity);

    // Fire-and-forget: pre-generate audio for the new word so it's ready before
    // the user taps play — but ONLY for Pro users. Free users' custom-card audio
    // is lazy (cache-first at play, Web Speech otherwise). If the subscription
    // service isn't wired (e.g. tests), skip eager generation to stay cost-safe.
    if (this.wordAudioService) {
      const text = (dto.content.article ? `${dto.content.article} ` : '') + dto.content.back;
      void (async () => {
        if (!this.subscriptions || !(await this.subscriptions.isProUser(userId))) return;
        await this.wordAudioService!.resolve(text, 'de-DE');
      })().catch(err => {
        this.logger.warn(`Pre-generation failed for "${text}":`, err);
      });
    }

    void this.syncService?.onCardCreated(saved).catch(err =>
      this.logger.warn(`Sync onCardCreated failed: ${err.message}`));

    return this.toModel(saved);
  }

  async update(userId: string, id: string, dto: UpdateCardDto): Promise<ScheduledCard> {
    const entity = await this.repo.findOneBy({ id, userId });
    if (!entity) throw new NotFoundException(`Card ${id} not found`);
    if (dto.content)      entity.content    = { ...entity.content, ...dto.content } as CardContent;
    if (dto.categoryIds)  entity.categoryIds = dto.categoryIds;
    if (dto.tags)         entity.tags        = dto.tags;
    if (dto.collectionId !== undefined) entity.collectionId = dto.collectionId ?? null;
    const saved = await this.repo.save(entity);

    void this.syncService?.onCardUpdated(saved).catch(err =>
      this.logger.warn(`Sync onCardUpdated failed: ${err.message}`));

    return this.toModel(saved);
  }

  async remove(userId: string, id: string): Promise<void> {
    const entity = await this.repo.findOneBy({ id, userId });
    if (!entity) throw new NotFoundException(`Card ${id} not found`);
    await this.repo.delete({ id, userId });

    void this.syncService?.onCardDeleted(entity).catch(err =>
      this.logger.warn(`Sync onCardDeleted failed: ${err.message}`));
  }

  async clearByCollection(userId: string, collectionId: string): Promise<{ deleted: number }> {
    const result = await this.repo.delete({ collectionId, userId });

    void this.syncService?.onCollectionCleared(collectionId).catch(err =>
      this.logger.warn(`Sync onCollectionCleared failed: ${err.message}`));

    return { deleted: result.affected ?? 0 };
  }

  private toModel(e: CardEntity): ScheduledCard {
    return {
      id: e.id,
      deckId: e.deckId,
      collectionId: e.collectionId,
      userId: e.userId,
      contextId: e.contextId,
      content: e.content,
      categoryIds: e.categoryIds,
      tags: e.tags,
      version: e.version,
      reviewState: e.scheduling.state,
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
      updatedAt: e.updatedAt instanceof Date ? e.updatedAt.toISOString() : e.updatedAt,
    };
  }
}
