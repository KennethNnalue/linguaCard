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
import { PODCAST_ENTITIES } from '../podcasts/entities';
import { CreatePodcasts1787442000000 } from '../podcasts/migration/CreatePodcasts';
import { AddPodcastTranscripts1787443000000 } from '../podcasts/migration/AddPodcastTranscripts';
import { AddPodcastAudioGeneration1787444000000 } from '../podcasts/migration/AddPodcastAudioGeneration';
import { AddPodcastLearningLoop1787445000000 } from '../podcasts/migration/AddPodcastLearningLoop';
import { AddPodcastSpeakerVoiceGender1787446000000 } from '../podcasts/migration/AddPodcastSpeakerVoiceGender';
import { BackfillPlatformStoryKeywordIds1787447000000 } from '../platform-stories/migration/BackfillPlatformStoryKeywordIds';
import { AddDailyStreakPolicyVersion1787448000000 } from '../engagement/migration/AddDailyStreakPolicyVersion';
import { AddPodcastQualifyingListening1787449000000 } from '../podcasts/migration/AddPodcastQualifyingListening';
import { SimplifyPodcastProduction1787450000000 } from '../podcasts/migration/SimplifyPodcastProduction';
import { ObjectDeletionJobEntity } from '../data-deletion/object-deletion-job.entity';
import { CreateObjectDeletionJobs1787451000000 } from '../data-deletion/migration/CreateObjectDeletionJobs';
import { AccountDeletionRequestEntity } from '../data-deletion/account-deletion-request.entity';
import { CreateAccountDeletionRequests1787452000000 } from '../data-deletion/migration/CreateAccountDeletionRequests';

export default registerAs('database', (): TypeOrmModuleOptions => ({
  type: 'postgres',
  url: process.env['DATABASE_URL'],
  ssl: process.env['NODE_ENV'] === 'production'
    ? { rejectUnauthorized: false }
    : false,
  entities: [UserEntity, CardEntity, ReviewSchedulingEntity, CollectionEntity, CategoryEntity, StoryEntity, WordAudioEntity, SubscriptionEntity, ReviewSessionEntity, ReviewCommitEntity, CardAdministrationEventEntity, PlatformStoryEntity, UserStoryProgressEntity, UserSettingsEntity, PushSubscriptionEntity, WordDictionaryEntity, PlatformCollectionEntity, PlatformCollectionWordEntity, PlatformCollectionImportEntity, DiscountCodeEntity, DiscountRedemptionEntity, ShareEntity, ShareSyncLinkEntity, EngagementProcessedEventEntity, DailyReviewCardEntity, DailyProgressEntity, RewardTransactionEntity, StreakFreezeTransactionEntity, ObjectDeletionJobEntity, AccountDeletionRequestEntity, ...VOCABULARY_ENTITIES, ...LEARNING_ITEM_ENTITIES, ...PODCAST_ENTITIES],
  migrations: [CreateEngagementTables1760000000000, CreateMultilingualVocabulary1787436000000, CreateLearningItems1787437000000, CreatePlatformCollectionImports1787438000000, AddPlatformCollectionVocabulary1787439000000, CompleteCanonicalCardProjection1787440000000, ProjectExistingCardsIntoCanonicalModel1787441000000, CreatePodcasts1787442000000, AddPodcastTranscripts1787443000000, AddPodcastAudioGeneration1787444000000, AddPodcastLearningLoop1787445000000, AddPodcastSpeakerVoiceGender1787446000000, BackfillPlatformStoryKeywordIds1787447000000, AddDailyStreakPolicyVersion1787448000000, AddPodcastQualifyingListening1787449000000, SimplifyPodcastProduction1787450000000, CreateObjectDeletionJobs1787451000000, CreateAccountDeletionRequests1787452000000],
  migrationsRun: process.env['NODE_ENV'] !== 'production',
  synchronize: process.env['TYPEORM_SYNCHRONIZE'] === 'true' && process.env['NODE_ENV'] !== 'production',
  logging: process.env['NODE_ENV'] !== 'production',
}));
