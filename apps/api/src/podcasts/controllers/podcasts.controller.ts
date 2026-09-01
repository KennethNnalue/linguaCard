import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type {
  PodcastEpisodeCompletion, PodcastEpisodePlayer, PodcastEpisodePreparation, PodcastLibraryResponse,
  PodcastListeningProgress, PodcastTopicDetail, PreparePodcastVocabularyResult,
} from '@lingua-card/shared/domain';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PodcastCatalogueService } from '../services/podcast-catalogue.service';
import { PodcastLearningLoopService } from '../services/podcast-learning-loop.service';
import { SavePodcastProgressDto } from '../dto/admin-podcast.dto';

@Controller('podcasts')
@UseGuards(JwtAuthGuard)
export class PodcastsController {
  constructor(
    private readonly catalogue: PodcastCatalogueService,
    private readonly learningLoop: PodcastLearningLoopService,
  ) {}

  @Get()
  listTopics(@CurrentUser() userId: string): Promise<PodcastLibraryResponse> {
    return this.catalogue.listTopics(userId);
  }

  @Get('topics/:topicId')
  getTopic(@Param('topicId') topicId: string): Promise<PodcastTopicDetail> {
    return this.catalogue.getTopic(topicId);
  }

  @Get('episodes/:episodeId/preparation')
  getPreparation(
    @CurrentUser() userId: string,
    @Param('episodeId') episodeId: string,
  ): Promise<PodcastEpisodePreparation> {
    return this.catalogue.getPreparation(userId, episodeId);
  }

  @Get('episodes/:episodeId/player')
  getPlayer(
    @CurrentUser() userId: string,
    @Param('episodeId') episodeId: string,
  ): Promise<PodcastEpisodePlayer> {
    return this.catalogue.getPlayer(userId, episodeId);
  }

  @Get('episodes/:episodeId/completion')
  getCompletion(
    @CurrentUser() userId: string,
    @Param('episodeId') episodeId: string,
  ): Promise<PodcastEpisodeCompletion> {
    return this.catalogue.getCompletion(userId, episodeId);
  }

  @Patch('episodes/:episodeId/progress')
  saveProgress(
    @CurrentUser() userId: string,
    @Param('episodeId') episodeId: string,
    @Body() dto: SavePodcastProgressDto,
  ): Promise<PodcastListeningProgress> {
    return this.learningLoop.saveProgress(userId, episodeId, dto);
  }

  @Post('episodes/:episodeId/prepare-vocabulary')
  prepareVocabulary(
    @CurrentUser() userId: string,
    @Param('episodeId') episodeId: string,
  ): Promise<PreparePodcastVocabularyResult> {
    return this.learningLoop.prepareVocabulary(userId, episodeId);
  }
}
