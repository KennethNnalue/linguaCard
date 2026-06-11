import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
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
} from '@lingua-card/shared/domain';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

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
