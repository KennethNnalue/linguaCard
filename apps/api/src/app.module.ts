import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { CardsModule } from './cards/cards.module';
import { CollectionsModule } from './collections/collections.module';
import { CategoriesModule } from './categories/categories.module';
import { StoriesModule } from './stories/stories.module';
import { SeedModule } from './seed/seed.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { HealthModule } from './health/health.module';
import { AiModule } from './ai/ai.module';
import { ImportModule } from './import/import.module';
import { WordAudioModule } from './word-audio/word-audio.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { ContactModule } from './contact/contact.module';
import { ReviewModule } from './review/review.module';
import { PlatformStoriesModule } from './platform-stories/platform-stories.module';
import { SettingsModule } from './settings/settings.module';
import { PushModule } from './push/push.module';
import { WordDictionaryModule } from './word-dictionary/word-dictionary.module';
import { AdminModule } from './admin/admin.module';
import { PlatformCollectionsModule } from './platform-collections/platform-collections.module';
import { DiscountCodesModule } from './discount-codes/discount-codes.module';
import { SharesModule } from './shares/shares.module';
import databaseConfig from './config/database.config';
import { aiConfig } from './config/ai.config';
import { EngagementModule } from './engagement/engagement.module';
import { VocabularyModule } from './vocabulary/vocabulary.module';
import { LearningItemsModule } from './learning-items/learning-items.module';
import { PodcastsModule } from './podcasts/podcasts.module';
import { DataDeletionModule } from './data-deletion/data-deletion.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Resolution order: most-specific first.
      // apps/api/.env  — full API config (TTS keys, R2, Groq, etc.)
      // .env           — root dev overrides (DB, JWT, Gemini key)
      // ../../.env     — fallback when CWD is apps/api/ during nx build
      envFilePath: ['apps/api/.env', '.env', '../../.env'],
      load: [databaseConfig, aiConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions =>
        config.get<TypeOrmModuleOptions>('database')!,
    }),
    AuthModule,
    HealthModule,
    AiModule,
    ImportModule,
    CardsModule,
    CollectionsModule,
    CategoriesModule,
    StoriesModule,
    WordAudioModule,
    SubscriptionsModule,
    ContactModule,
    ReviewModule,
    EngagementModule,
    PlatformStoriesModule,
    ScheduleModule.forRoot(),
    SettingsModule,
    PushModule,
    WordDictionaryModule,
    VocabularyModule,
    LearningItemsModule,
    AdminModule,
    PlatformCollectionsModule,
    DiscountCodesModule,
    SharesModule,
    PodcastsModule,
    DataDeletionModule,
    SeedModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
