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

export default registerAs('database', (): TypeOrmModuleOptions => ({
  type: 'postgres',
  url: process.env['DATABASE_URL'],
  ssl: process.env['NODE_ENV'] === 'production'
    ? { rejectUnauthorized: false }
    : false,
  entities: [UserEntity, CardEntity, CollectionEntity, CategoryEntity, StoryEntity, WordAudioEntity, SubscriptionEntity, ReviewSessionEntity, PlatformStoryEntity, UserStoryProgressEntity, UserSettingsEntity, PushSubscriptionEntity, WordDictionaryEntity, PlatformCollectionEntity, PlatformCollectionWordEntity],
  synchronize: true,
  logging: process.env['NODE_ENV'] !== 'production',
}));
