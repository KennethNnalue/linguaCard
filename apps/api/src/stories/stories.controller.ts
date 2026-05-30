import { Controller, Get, Post, Delete, Patch, Param, Body } from '@nestjs/common';
import { StoriesService } from './stories.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { GenerateStoryDto } from '@lingua-card/shared/domain';

@Controller('stories')
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @Get()
  findAll(@CurrentUser() userId: string) {
    return this.storiesService.findAll(userId);
  }

  @Get(':id')
  findOne(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.storiesService.findOne(userId, id);
  }

  @Post('generate')
  generate(@CurrentUser() userId: string, @Body() dto: GenerateStoryDto) {
    return this.storiesService.generate(userId, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.storiesService.remove(userId, id);
  }

  @Post(':id/generate-audio')
  generateAudio(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.storiesService.generateAudio(userId, id);
  }

  @Patch(':id/listen')
  recordListen(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.storiesService.recordListen(userId, id);
  }

  /** Dev-only: seeds a static story without calling AI APIs */
  @Post('seed')
  seedStory(@CurrentUser() userId: string) {
    if (process.env['NODE_ENV'] === 'production') {
      return { message: 'Not available in production' };
    }
    return this.storiesService.seedStory(userId);
  }
}
