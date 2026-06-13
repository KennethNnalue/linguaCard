import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
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
}
