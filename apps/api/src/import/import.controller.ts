import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { ImageImportRequest, ImageImportResult } from '@lingua-card/shared/domain';
import { ImageImportService } from './image-import.service';

@Controller('import')
export class ImportController {
  constructor(private readonly imageImportService: ImageImportService) {}

  @Post('image')
  @HttpCode(HttpStatus.OK)
  extractWords(@Body() dto: ImageImportRequest): Promise<ImageImportResult> {
    return this.imageImportService.extractWords(dto);
  }
}
