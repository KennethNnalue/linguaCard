import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';
import { StoryEntity } from './story.entity';
import { StoryGenerationService } from './story-generation.service';
import { StoryPromptBuilder } from './story-prompt.builder';
import { StoryAudioService } from './story-audio.service';
import { StoryVocabMapper } from './story-vocab.mapper';
import { AiModule } from '../ai/ai.module';
import { ConfigModule } from '@nestjs/config';
import { CardEntity } from '../cards/card.entity';
import { StorageService } from '../storage/storage.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { WordDictionaryModule } from '../word-dictionary/word-dictionary.module';
import { SettingsModule } from '../settings/settings.module';
import { SharesModule } from '../shares/shares.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StoryEntity, CardEntity]),
    AiModule,
    ConfigModule,
    SubscriptionsModule,
    WordDictionaryModule,
    SettingsModule,
    forwardRef(() => SharesModule),
  ],
  controllers: [StoriesController],
  providers: [
    StoriesService,
    StoryGenerationService,
    StoryPromptBuilder,
    StoryAudioService,
    StoryVocabMapper,
    StorageService,
  ],
  exports: [StoryAudioService],
})
export class StoriesModule {}
