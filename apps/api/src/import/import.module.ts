import { Module } from '@nestjs/common';
import { ImportController } from './import.controller';
import { ImageImportService } from './image-import.service';
import { ImageImportPromptBuilder } from './image-import-prompt.builder';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [ImportController],
  providers: [ImageImportService, ImageImportPromptBuilder],
})
export class ImportModule {}
