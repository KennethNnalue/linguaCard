import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformStoryEntity } from './platform-story.entity';
import { UserStoryProgressEntity } from './user-story-progress.entity';
import { PlatformStoriesService } from './platform-stories.service';
import { PlatformStoriesController } from './platform-stories.controller';
import { PlatformStoriesSeedService } from './seed/platform-stories-seed.service';
import { StoryEntity } from '../stories/story.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlatformStoryEntity, UserStoryProgressEntity, StoryEntity]),
  ],
  controllers: [PlatformStoriesController],
  providers: [PlatformStoriesService, PlatformStoriesSeedService],
  exports: [PlatformStoriesService, TypeOrmModule],
})
export class PlatformStoriesModule {}
