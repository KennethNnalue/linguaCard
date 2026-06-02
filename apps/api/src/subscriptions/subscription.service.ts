import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
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

  async createFree(userId: string): Promise<SubscriptionEntity> {
    const entity = this.subRepo.create({ userId, tier: 'free' });
    return this.subRepo.save(entity);
  }

  async getOrCreateForUser(userId: string): Promise<SubscriptionEntity> {
    let sub = await this.subRepo.findOneBy({ userId });
    if (!sub) sub = await this.createFree(userId);
    return sub;
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
