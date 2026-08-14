import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { CardEntity } from '../cards/card.entity';
import { CollectionEntity } from '../collections/collection.entity';
import { CategoryEntity } from '../categories/category.entity';
import { UserEntity } from '../auth/user.entity';
import { StoryEntity } from '../stories/story.entity';
import { WordAudioEntity } from '../word-audio/word-audio.entity';
import { SubscriptionEntity } from '../subscriptions/subscription.entity';
import { ReviewSessionEntity } from '../review/review-session.entity';
import { PlatformStoryEntity } from '../platform-stories/platform-story.entity';
import { UserStoryProgressEntity } from '../platform-stories/user-story-progress.entity';
import { UserSettingsEntity } from '../settings/user-settings.entity';
import { PushSubscriptionEntity } from '../push/push-subscription.entity';
import { WordDictionaryEntity } from '../word-dictionary/word-dictionary.entity';
import { PlatformCollectionEntity } from '../admin/platform-collection.entity';
import { PlatformCollectionWordEntity } from '../admin/platform-collection-word.entity';
import { DiscountCodeEntity } from '../discount-codes/discount-code.entity';
import { DiscountRedemptionEntity } from '../discount-codes/discount-redemption.entity';
import { ShareEntity } from '../shares/share.entity';
import { ShareSyncLinkEntity } from '../shares/share-sync-link.entity';
import { ReviewCommitEntity } from '../review/review-commit.entity';
import { CardAdministrationEventEntity } from '../review/card-administration.entity';
import { ReviewSchedulingEntity } from '../review/review-scheduling.entity';

export default registerAs('database', (): TypeOrmModuleOptions => ({
  type: 'postgres',
  url: process.env['DATABASE_URL'],
  ssl: process.env['NODE_ENV'] === 'production'
    ? { rejectUnauthorized: false }
    : false,
  entities: [UserEntity, CardEntity, ReviewSchedulingEntity, CollectionEntity, CategoryEntity, StoryEntity, WordAudioEntity, SubscriptionEntity, ReviewSessionEntity, ReviewCommitEntity, CardAdministrationEventEntity, PlatformStoryEntity, UserStoryProgressEntity, UserSettingsEntity, PushSubscriptionEntity, WordDictionaryEntity, PlatformCollectionEntity, PlatformCollectionWordEntity, DiscountCodeEntity, DiscountRedemptionEntity, ShareEntity, ShareSyncLinkEntity],
  synchronize: process.env['TYPEORM_SYNCHRONIZE'] === 'true' && process.env['NODE_ENV'] !== 'production',
  logging: process.env['NODE_ENV'] !== 'production',
}));
