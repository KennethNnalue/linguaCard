import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type {
  AdminPlatformCollectionImportPreview,
  AdminPlatformCollectionImportResult,
  AdminPlatformCollectionImportStatus,
} from '@lingua-card/shared/domain';
import {
  CreatePlatformCollectionImportDto,
  PlatformCollectionImportPayloadDto,
} from './dto/platform-collection-import.dto';
import { PlatformCollectionImportService } from './platform-collection-import.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@Controller('v2/admin/platform-collection-imports')
@UseGuards(JwtAuthGuard, AdminGuard)
export class PlatformCollectionImportController {
  constructor(private readonly collectionImports: PlatformCollectionImportService) {}

  @Post('validate')
  validate(
    @Body() dto: PlatformCollectionImportPayloadDto,
  ): Promise<AdminPlatformCollectionImportPreview> {
    return this.collectionImports.validate(dto);
  }

  @Post()
  importDraft(
    @Body() dto: CreatePlatformCollectionImportDto,
  ): Promise<AdminPlatformCollectionImportResult> {
    return this.collectionImports.importDraft(dto.fingerprint, dto.payload);
  }

  @Get(':id')
  findImport(@Param('id') id: string): Promise<AdminPlatformCollectionImportStatus> {
    return this.collectionImports.findImport(id);
  }

  @Post(':id/retry')
  retryImport(@Param('id') id: string): Promise<AdminPlatformCollectionImportResult> {
    return this.collectionImports.retryImport(id);
  }
}
