import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminService } from './admin.service';
import type {
  AdminImportCollectionDto,
  AdminImportCollectionResult,
  AdminImportCollectionJsonDto,
  AdminImportCollectionJsonResult,
  AdminImportStoryDto,
  AdminImportStoryResult,
  AdminPlatformCollectionListItem,
  AdminPlatformCollectionWordItem,
  AdminReorderPlatformCollectionWordsDto,
  AdminPlatformStoryListItem,
  AdminPublishToggleDto,
  AdminSetStoryCategoryDto,
} from '@lingua-card/shared/domain';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('platform-collections')
  listCollections(): Promise<AdminPlatformCollectionListItem[]> {
    return this.adminService.listCollections();
  }

  @Get('platform-collections/:id/words')
  listCollectionWords(@Param('id') id: string): Promise<AdminPlatformCollectionWordItem[]> {
    return this.adminService.listCollectionWords(id);
  }

  @Patch('platform-collections/:id/words/order')
  @HttpCode(204)
  reorderCollectionWords(
    @Param('id') id: string,
    @Body() dto: AdminReorderPlatformCollectionWordsDto,
  ): Promise<void> {
    return this.adminService.reorderCollectionWords(id, dto.itemIds);
  }

  @Delete('platform-collections/:id/words/:itemId')
  @HttpCode(204)
  removeCollectionWord(@Param('id') id: string, @Param('itemId') itemId: string): Promise<void> {
    return this.adminService.removeCollectionWord(id, itemId);
  }

  @Get('platform-stories')
  listStories(): Promise<AdminPlatformStoryListItem[]> {
    return this.adminService.listStories();
  }

  @Delete('platform-collections/:id')
  @HttpCode(204)
  async deleteCollection(@Param('id') id: string): Promise<void> {
    await this.adminService.deleteCollection(id);
  }

  @Delete('platform-stories/:id')
  @HttpCode(204)
  async deleteStory(@Param('id') id: string): Promise<void> {
    await this.adminService.deleteStory(id);
  }

  @Patch('platform-collections/:id/publish')
  @HttpCode(204)
  async setPublished(
    @Param('id') id: string,
    @Body() dto: AdminPublishToggleDto,
  ): Promise<void> {
    await this.adminService.setPublished(id, dto.isPublished);
  }

  @Patch('platform-collections/:id/story-category')
  @HttpCode(204)
  async setStoryCategory(
    @Param('id') id: string,
    @Body() dto: AdminSetStoryCategoryDto,
  ): Promise<void> {
    await this.adminService.setStoryCategory(id, dto.storyCategory ?? null);
  }

  @Post('platform-collections/backfill-audio')
  @HttpCode(202)
  backfillCollectionAudio(): { started: boolean } {
    // Runs in the background (large libraries can take minutes) — returns 202 now.
    return this.adminService.startBackfillPublishedCollectionAudio();
  }

  @Post('platform-collections/import')
  @HttpCode(200)
  importCollection(@Body() dto: AdminImportCollectionDto): Promise<AdminImportCollectionResult> {
    return this.adminService.importCollection(dto);
  }

  @Post('platform-collections/import-json')
  @HttpCode(200)
  importCollectionJson(@Body() dto: AdminImportCollectionJsonDto): Promise<AdminImportCollectionJsonResult> {
    return this.adminService.importCollectionJson(dto);
  }

  @Post('platform-stories/import')
  @HttpCode(200)
  importStory(@Body() dto: AdminImportStoryDto): Promise<AdminImportStoryResult> {
    return this.adminService.importStory(dto);
  }

  @Post('platform-stories/:id/generate-audio')
  @HttpCode(200)
  regenerateStoryAudio(@Param('id') id: string): Promise<AdminImportStoryResult> {
    return this.adminService.regenerateStoryAudio(id);
  }

  @Patch('platform-stories/:id/publish')
  @HttpCode(204)
  async setPublishedStory(
    @Param('id') id: string,
    @Body() dto: AdminPublishToggleDto,
  ): Promise<void> {
    await this.adminService.setPublishedStory(id, dto.isPublished);
  }
}
