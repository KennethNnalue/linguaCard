import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EngagementDashboardService, ServerEngagementDashboard } from './engagement-dashboard.service';
import { CompleteCollectionListeningDto, CompleteStoryDto } from './dto/engagement-completion.dto';
import { EngagementCompletionService, EngagementCompletionResult } from './engagement-completion.service';

@Controller('engagement')
export class EngagementController {
  constructor(
    private readonly engagement: EngagementDashboardService,
    private readonly completions: EngagementCompletionService,
  ) {}

  @Get('dashboard')
  dashboard(@CurrentUser() userId: string): Promise<ServerEngagementDashboard> {
    return this.engagement.dashboard(userId);
  }

  @Post('collections/:collectionId/listening-completions')
  completeCollectionListening(
    @CurrentUser() userId: string,
    @Param('collectionId') collectionId: string,
    @Body() dto: CompleteCollectionListeningDto,
  ): Promise<EngagementCompletionResult> {
    return this.completions.completeCollectionListening(userId, collectionId, dto.cardIds);
  }

  @Post('stories/:storyId/completions')
  completeStory(
    @CurrentUser() userId: string,
    @Param('storyId') storyId: string,
    @Body() dto: CompleteStoryDto,
  ): Promise<EngagementCompletionResult> {
    return this.completions.completeStory(userId, storyId, dto.sentenceIndexes);
  }
}
