import {
  Controller, Get, Post, Param, Body, Query, ParseIntPipe,
  DefaultValuePipe, HttpCode,
} from '@nestjs/common';
import { PlatformStoriesService } from './platform-stories.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { StoryDifficulty, StoryCategory } from '@lingua-card/shared/domain';

@Controller('platform-stories')
export class PlatformStoriesController {
  constructor(private readonly service: PlatformStoriesService) {}

  /** GET /platform-stories?level=A1&category=travel&nativeLang=en&limit=20&offset=0 */
  @Get()
  findAll(
    @CurrentUser() userId: string,
    @Query('level') level?: StoryDifficulty,
    @Query('category') category?: StoryCategory,
    @Query('isFiction') isFiction?: string,
    @Query('isPremium') isPremium?: string,
    @Query('nativeLang') nativeLang?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.service.findAll(userId, {
      level,
      category,
      isFiction:  isFiction  !== undefined ? isFiction  === 'true' : undefined,
      isPremium:  isPremium  !== undefined ? isPremium  === 'true' : undefined,
      nativeLang,
      limit,
      offset,
    });
  }

  /** GET /platform-stories/:id */
  @Get(':id')
  async findOne(
    @CurrentUser() userId: string,
    @Param('id') id: string,
  ) {
    const story = await this.service.findById(id);
    // Fire-and-forget read count increment — does not block response
    this.service.incrementReadCount(id).catch(() => undefined);
    return story;
  }

  /** GET /platform-stories/:id/progress */
  @Get(':id/progress')
  getProgress(
    @CurrentUser() userId: string,
    @Param('id') id: string,
  ) {
    return this.service.getUserProgress(userId, id);
  }

  /** POST /platform-stories/:id/adopt — copy into the user's own stories (idempotent) */
  @Post(':id/adopt')
  @HttpCode(200)
  adopt(
    @CurrentUser() userId: string,
    @Param('id') id: string,
  ) {
    return this.service.adopt(userId, id);
  }

  /** POST /platform-stories/:id/read */
  @Post(':id/read')
  markAsRead(
    @CurrentUser() userId: string,
    @Param('id') id: string,
  ) {
    return this.service.markAsRead(userId, id);
  }

  /** POST /platform-stories/:id/quiz-score */
  @Post(':id/quiz-score')
  saveQuizScore(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body('score') score: number,
  ) {
    return this.service.saveQuizScore(userId, id, score);
  }

  /** POST /platform-stories/:id/saved-words */
  @Post(':id/saved-words')
  addSavedWord(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body('wordId') wordId: string,
  ) {
    return this.service.addSavedWord(userId, id, wordId);
  }
}
