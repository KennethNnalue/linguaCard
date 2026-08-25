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
import { EngagementProcessedEventEntity } from '../engagement/entities/engagement-processed-event.entity';
import { DailyReviewCardEntity } from '../engagement/entities/daily-review-card.entity';
import { DailyProgressEntity } from '../engagement/entities/daily-progress.entity';
import { RewardTransactionEntity } from '../engagement/entities/reward-transaction.entity';
import { StreakFreezeTransactionEntity } from '../engagement/entities/streak-freeze-transaction.entity';
import { CreateEngagementTables1760000000000 } from '../engagement/migration/CreateEngagementTables';
import { VOCABULARY_ENTITIES } from '../vocabulary/vocabulary.module';
import { CreateMultilingualVocabulary1787436000000 } from '../vocabulary/migration/CreateMultilingualVocabulary';
import { LEARNING_ITEM_ENTITIES } from '../learning-items/learning-items.module';
import { CreateLearningItems1787437000000 } from '../learning-items/migration/CreateLearningItems';
import { PlatformCollectionImportEntity } from '../admin/platform-collection-import.entity';
import { CreatePlatformCollectionImports1787438000000 } from '../admin/migration/CreatePlatformCollectionImports';
import { AddPlatformCollectionVocabulary1787439000000 } from '../admin/migration/AddPlatformCollectionVocabulary';
import { CompleteCanonicalCardProjection1787440000000 } from '../learning-items/migration/CompleteCanonicalCardProjection';
import { ProjectExistingCardsIntoCanonicalModel1787441000000 } from '../learning-items/migration/ProjectExistingCardsIntoCanonicalModel';

export default registerAs('database', (): TypeOrmModuleOptions => ({
  type: 'postgres',
  url: process.env['DATABASE_URL'],
  ssl: process.env['NODE_ENV'] === 'production'
    ? { rejectUnauthorized: false }
    : false,
  entities: [UserEntity, CardEntity, ReviewSchedulingEntity, CollectionEntity, CategoryEntity, StoryEntity, WordAudioEntity, SubscriptionEntity, ReviewSessionEntity, ReviewCommitEntity, CardAdministrationEventEntity, PlatformStoryEntity, UserStoryProgressEntity, UserSettingsEntity, PushSubscriptionEntity, WordDictionaryEntity, PlatformCollectionEntity, PlatformCollectionWordEntity, PlatformCollectionImportEntity, DiscountCodeEntity, DiscountRedemptionEntity, ShareEntity, ShareSyncLinkEntity, EngagementProcessedEventEntity, DailyReviewCardEntity, DailyProgressEntity, RewardTransactionEntity, StreakFreezeTransactionEntity, ...VOCABULARY_ENTITIES, ...LEARNING_ITEM_ENTITIES],
  migrations: [CreateEngagementTables1760000000000, CreateMultilingualVocabulary1787436000000, CreateLearningItems1787437000000, CreatePlatformCollectionImports1787438000000, AddPlatformCollectionVocabulary1787439000000, CompleteCanonicalCardProjection1787440000000, ProjectExistingCardsIntoCanonicalModel1787441000000],
  synchronize: process.env['TYPEORM_SYNCHRONIZE'] === 'true' && process.env['NODE_ENV'] !== 'production',
  logging: process.env['NODE_ENV'] !== 'production',
}));
