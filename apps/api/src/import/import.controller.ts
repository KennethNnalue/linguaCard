import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import type {
  EnrichWordsRequest,
  EnrichWordsResult,
  ImageImportRequest,
  ImageImportResult,
  RawExtractedWord,
  WordExtractionResult,
} from '@lingua-card/shared/domain';
import { ImageImportService } from './image-import.service';
import { ImageExtractService } from './image-extract.service';
import { WordEnrichService } from './word-enrich.service';
import { CollectionCompleteService } from './collection-complete.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('import')
export class ImportController {
  constructor(
    private readonly imageImportService:      ImageImportService,
    private readonly imageExtractService:     ImageExtractService,
    private readonly wordEnrichService:       WordEnrichService,
    private readonly collectionCompleteService: CollectionCompleteService,
  ) {}

  /** Legacy single-pass endpoint — kept for backwards compatibility */
  @Post('image')
  @HttpCode(HttpStatus.OK)
  extractWords(@Body() dto: ImageImportRequest): Promise<ImageImportResult> {
    return this.imageImportService.extractWords(dto);
  }

  /** Phase 1: extract raw words from image (fast, rarely truncates) */
  @Post('image/extract')
  @HttpCode(HttpStatus.OK)
  extractRawWords(@Body() dto: ImageImportRequest): Promise<WordExtractionResult> {
    return this.imageExtractService.extractRawWords(dto);
  }

  /** Phase 2: enrich raw words into full card data in batches of 10 */
  @Post('enrich')
  @HttpCode(HttpStatus.OK)
  enrichWords(@Body() dto: EnrichWordsRequest): Promise<EnrichWordsResult> {
    return this.wordEnrichService.enrichWords(dto);
  }

  /** Resume enrichment for an incomplete collection */
  @Post('complete/:collectionId')
  @HttpCode(HttpStatus.OK)
  completeCollection(
    @CurrentUser() userId: string,
    @Param('collectionId') collectionId: string,
  ): Promise<{ newCards: number; pendingWords: RawExtractedWord[]; isComplete: boolean }> {
    return this.collectionCompleteService.resume(userId, collectionId);
  }
}
