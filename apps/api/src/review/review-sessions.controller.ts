import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpsertReviewSessionBatchDto, UpsertReviewSessionDto } from './review-session.dto';
import { ReviewSessionsService } from './review-sessions.service';

@Controller('review/sessions')
export class ReviewSessionsController {
  constructor(private readonly sessionsService: ReviewSessionsService) {}

  /** Upsert a single completed session (called immediately when online). */
  @Post()
  upsert(@CurrentUser() userId: string, @Body() dto: UpsertReviewSessionDto) {
    return this.sessionsService.upsert(userId, dto);
  }

  /** Batch upsert — called by the offline sync handler when reconnecting. */
  @Post('batch')
  upsertBatch(@CurrentUser() userId: string, @Body() dto: UpsertReviewSessionBatchDto) {
    return this.sessionsService.upsertBatch(userId, dto.sessions);
  }

  /** Fetch recent sessions for cross-device hydration (max 50). */
  @Get()
  findRecent(
    @CurrentUser() userId: string,
    @Query('limit') limit?: string,
  ) {
    return this.sessionsService.findRecent(userId, limit ? parseInt(limit, 10) : 50);
  }
}
