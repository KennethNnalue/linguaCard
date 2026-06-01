import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportController } from './import.controller';
import { ImageImportService } from './image-import.service';
import { ImageImportPromptBuilder } from './image-import-prompt.builder';
import { ImageExtractService } from './image-extract.service';
import { ImageExtractPromptBuilder } from './image-extract-prompt.builder';
import { WordEnrichService } from './word-enrich.service';
import { WordEnrichPromptBuilder } from './word-enrich-prompt.builder';
import { CollectionCompleteService } from './collection-complete.service';
import { AiModule } from '../ai/ai.module';
import { CollectionEntity } from '../collections/collection.entity';
import { CardEntity } from '../cards/card.entity';

@Module({
  imports: [
    AiModule,
    TypeOrmModule.forFeature([CollectionEntity, CardEntity]),
  ],
  controllers: [ImportController],
  providers: [
    ImageImportService,
    ImageImportPromptBuilder,
    ImageExtractService,
    ImageExtractPromptBuilder,
    WordEnrichService,
    WordEnrichPromptBuilder,
    CollectionCompleteService,
  ],
})
export class ImportModule {}
