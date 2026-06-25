import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Not, Repository } from 'typeorm';
import { SubscriptionEntity } from './subscription.entity';
import { StoryEntity } from '../stories/story.entity';
import { CollectionEntity } from '../collections/collection.entity';
import type { Subscription, SubscriptionStatus, SubscriptionTier } from '@lingua-card/shared/domain';

const FREE_STORY_LIMIT        = 3;
const FREE_IMAGE_IMPORT_LIMIT = 3;

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(SubscriptionEntity)
    private readonly subRepo: Repository<SubscriptionEntity>,
    @InjectRepository(StoryEntity)
    private readonly storyRepo: Repository<StoryEntity>,
    @InjectRepository(CollectionEntity)
    private readonly collectionRepo: Repository<CollectionEntity>,
  ) {}

  /** Resolve the repository to use — the transaction-scoped one when a manager is supplied. */
  private repo(manager?: EntityManager): Repository<SubscriptionEntity> {
    return manager ? manager.getRepository(SubscriptionEntity) : this.subRepo;
  }

  async createFree(userId: string, manager?: EntityManager): Promise<SubscriptionEntity> {
    const repo = this.repo(manager);
    const entity = repo.create({ userId, tier: 'free' });
    return repo.save(entity);
  }

  async getOrCreateForUser(userId: string, manager?: EntityManager): Promise<SubscriptionEntity> {
    let sub = await this.repo(manager).findOneBy({ userId });
    if (!sub) sub = await this.createFree(userId, manager);
    return sub;
  }

  /**
   * Lightweight Pro check (one query) for hot paths like audio resolution,
   * where the full getStatusForUser() (which also counts stories + imports)
   * would be unnecessarily heavy.
   */
  async isProUser(userId: string): Promise<boolean> {
    const sub = await this.getOrCreateForUser(userId);
    return sub.tier === 'pro' && (sub.expiresAt === null || sub.expiresAt > new Date());
  }

  async getStatusForUser(userId: string): Promise<SubscriptionStatus> {
    const sub = await this.getOrCreateForUser(userId);

    const [storiesGenerated, imageImportsUsed] = await Promise.all([
      this.storyRepo.countBy({ userId }),
      this.collectionRepo.countBy({ userId, sourceImageDescription: Not(IsNull()) }),
    ]);

    const isActive =
      sub.tier === 'pro' &&
      (sub.expiresAt === null || sub.expiresAt > new Date());

    const storiesRemaining =
      isActive ? null : Math.max(0, FREE_STORY_LIMIT - storiesGenerated);

    const imageImportsRemaining =
      isActive ? null : Math.max(0, FREE_IMAGE_IMPORT_LIMIT - imageImportsUsed);

    return {
      tier: sub.tier,
      isActive,
      storiesGenerated,
      storiesRemaining,
      freeStoryLimit: FREE_STORY_LIMIT,
      imageImportsUsed,
      imageImportsRemaining,
      freeImageImportLimit: FREE_IMAGE_IMPORT_LIMIT,
    };
  }

  /**
   * Self-service Pro grant — used by discount-code redemption (replaces the manual SQL flow).
   * `expiresAt` null = lifetime. Pass `manager` to run inside a caller's transaction.
   */
  async activatePro(
    userId: string,
    opts: { expiresAt: Date | null; notes?: string; manager?: EntityManager },
  ): Promise<SubscriptionEntity> {
    const sub = await this.getOrCreateForUser(userId, opts.manager);
    sub.tier        = 'pro';
    sub.activatedAt = new Date();
    sub.expiresAt   = opts.expiresAt;
    if (opts.notes) sub.notes = opts.notes;
    return this.repo(opts.manager).save(sub);
  }

  async getEffectiveTier(userId: string): Promise<SubscriptionTier> {
    const status = await this.getStatusForUser(userId);
    return status.isActive ? 'pro' : 'free';
  }

  toModel(entity: SubscriptionEntity): Subscription {
    return {
      id:          entity.id,
      userId:      entity.userId,
      tier:        entity.tier,
      activatedAt: entity.activatedAt?.toISOString() ?? null,
      expiresAt:   entity.expiresAt?.toISOString()   ?? null,
      createdAt:   entity.createdAt.toISOString(),
    };
  }
}
