import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';
import { createNewReviewScheduling } from '../review/review-scheduling.entity';
import { ShareSyncLinkEntity } from './share-sync-link.entity';
import { CardEntity } from '../cards/card.entity';
import { StoryEntity } from '../stories/story.entity';

@Injectable()
export class ShareSyncService {
  private readonly logger = new Logger(ShareSyncService.name);

  constructor(
    @InjectRepository(ShareSyncLinkEntity)
    private readonly linkRepo: Repository<ShareSyncLinkEntity>,
    @InjectRepository(CardEntity)
    private readonly cardRepo: Repository<CardEntity>,
    @InjectRepository(StoryEntity)
    private readonly storyRepo: Repository<StoryEntity>,
  ) {}

  async createLink(
    shareId: string,
    sourceResourceId: string,
    targetResourceId: string,
    resourceType: 'collection' | 'story',
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(ShareSyncLinkEntity) : this.linkRepo;
    await repo.save(repo.create({
      id: randomUUID(),
      shareId,
      sourceResourceId,
      targetResourceId,
      resourceType,
      isActive: true,
    }));
  }

  async deactivateBySource(sourceResourceId: string): Promise<void> {
    await this.linkRepo.update(
      { sourceResourceId, isActive: true },
      { isActive: false },
    );
  }

  /**
   * Deactivates links pointing at a resource that is being deleted (the
   * recipient's cloned copy). Prevents dangling active links that would log
   * "not found" warnings on every subsequent sender edit.
   */
  async deactivateByTarget(targetResourceId: string): Promise<void> {
    await this.linkRepo.update(
      { targetResourceId, isActive: true },
      { isActive: false },
    );
  }

  async deactivateLink(linkId: string): Promise<void> {
    await this.linkRepo.update(linkId, { isActive: false });
  }

  async findActiveLinkByTarget(targetResourceId: string, userId?: string): Promise<ShareSyncLinkEntity | null> {
    const link = await this.linkRepo.findOneBy({ targetResourceId, isActive: true });
    if (!link || !userId) return link;

    const ownsResource = await this.userOwnsResource(userId, targetResourceId, link.resourceType);
    return ownsResource ? link : null;
  }

  private async userOwnsResource(userId: string, resourceId: string, type: 'collection' | 'story'): Promise<boolean> {
    const table = type === 'collection' ? 'collections' : 'stories';
    const rows: Array<{ id: string }> = await this.linkRepo.manager.query(
      `SELECT id FROM ${table} WHERE id = $1 AND "userId" = $2 LIMIT 1`,
      [resourceId, userId],
    );
    return rows.length > 0;
  }

  // ── Collection sync ──────────────────────────────────────────────────

  async onCardCreated(card: CardEntity): Promise<void> {
    if (!card.collectionId) return;
    const links = await this.activeLinksForSource(card.collectionId, 'collection');
    if (!links.length) return;

    for (const link of links) {
      try {
        const cardId = randomUUID();
        const clone = this.cardRepo.create({
          id: cardId,
          userId: await this.ownerOfCollection(link.targetResourceId),
          collectionId: link.targetResourceId,
          deckId: card.deckId,
          contextId: card.contextId,
          dictionaryWordId: card.dictionaryWordId,
          content: { ...card.content },
          categoryIds: [...card.categoryIds],
          tags: [...card.tags],
          version: 1,
          scheduling: createNewReviewScheduling(cardId),
        });
        await this.cardRepo.save(clone);
      } catch (err) {
        this.logger.warn(`Sync card create failed for link ${link.id}: ${(err as Error).message}`);
      }
    }
  }

  async onCardUpdated(card: CardEntity): Promise<void> {
    if (!card.collectionId) return;
    const links = await this.activeLinksForSource(card.collectionId, 'collection');
    if (!links.length) return;

    for (const link of links) {
      try {
        const target = await this.findMatchingCard(card, link.targetResourceId);
        if (!target) continue;
        target.content = { ...card.content };
        target.categoryIds = [...card.categoryIds];
        target.tags = [...card.tags];
        await this.cardRepo.save(target);
      } catch (err) {
        this.logger.warn(`Sync card update failed for link ${link.id}: ${(err as Error).message}`);
      }
    }
  }

  async onCardDeleted(card: CardEntity): Promise<void> {
    if (!card.collectionId) return;
    const links = await this.activeLinksForSource(card.collectionId, 'collection');
    if (!links.length) return;

    for (const link of links) {
      try {
        const target = await this.findMatchingCard(card, link.targetResourceId);
        if (target) await this.cardRepo.remove(target);
      } catch (err) {
        this.logger.warn(`Sync card delete failed for link ${link.id}: ${(err as Error).message}`);
      }
    }
  }

  async onCollectionCleared(collectionId: string): Promise<void> {
    const links = await this.activeLinksForSource(collectionId, 'collection');
    if (!links.length) return;

    for (const link of links) {
      try {
        await this.cardRepo.delete({ collectionId: link.targetResourceId });
      } catch (err) {
        this.logger.warn(`Sync collection clear failed for link ${link.id}: ${(err as Error).message}`);
      }
    }
  }

  // ── Story sync ───────────────────────────────────────────────────────

  async onStoryUpdated(story: StoryEntity): Promise<void> {
    const links = await this.activeLinksForSource(story.id, 'story');
    if (!links.length) return;

    for (const link of links) {
      try {
        const target = await this.storyRepo.findOneBy({ id: link.targetResourceId });
        if (!target) continue;
        target.title = story.title;
        target.titleTranslation = story.titleTranslation;
        target.bodyDe = story.bodyDe;
        target.bodyNative = story.bodyNative;
        target.sentences = story.sentences;
        target.wordTimestamps = story.wordTimestamps;
        target.vocabWords = story.vocabWords;
        target.audioUrl = story.audioUrl;
        target.audioDurationMs = story.audioDurationMs;
        target.quizQuestions = story.quizQuestions;
        target.grammarNotes = story.grammarNotes;
        target.keywords = story.keywords;
        target.coverImageUrl = story.coverImageUrl;
        await this.storyRepo.save(target);
      } catch (err) {
        this.logger.warn(`Sync story update failed for link ${link.id}: ${(err as Error).message}`);
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private async activeLinksForSource(sourceId: string, type: 'collection' | 'story'): Promise<ShareSyncLinkEntity[]> {
    return this.linkRepo.find({
      where: { sourceResourceId: sourceId, resourceType: type, isActive: true },
    });
  }

  private async findMatchingCard(sourceCard: CardEntity, targetCollectionId: string): Promise<CardEntity | null> {
    if (sourceCard.dictionaryWordId) {
      return this.cardRepo.findOneBy({
        collectionId: targetCollectionId,
        dictionaryWordId: sourceCard.dictionaryWordId,
      });
    }
    return this.cardRepo.createQueryBuilder('card')
      .where('card."collectionId" = :collectionId', { collectionId: targetCollectionId })
      .andWhere("card.content->>'back' = :back", { back: sourceCard.content.back })
      .getOne();
  }

  private async ownerOfCollection(collectionId: string): Promise<string> {
    const row: { userId: string } | undefined = await this.cardRepo.manager
      .query('SELECT "userId" FROM collections WHERE id = $1 LIMIT 1', [collectionId])
      .then((rows: Array<{ userId: string }>) => rows[0]);
    if (!row) throw new Error(`Collection ${collectionId} not found`);
    return row.userId;
  }
}
