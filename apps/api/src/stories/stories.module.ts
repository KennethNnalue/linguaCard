import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    TypeOrmModule.forFeature([StoryEntity, CardEntity]),
    AiModule,
    ConfigModule,
    SubscriptionsModule,
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
})
export class StoriesModule {}
