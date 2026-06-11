import { forwardRef, Module } from '@nestjs/common';
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
import { CardsModule } from '../cards/cards.module';
import { WordAudioModule } from '../word-audio/word-audio.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { CollectionEntity } from '../collections/collection.entity';
import { CardEntity } from '../cards/card.entity';
import { WordDictionaryModule } from '../word-dictionary/word-dictionary.module';

@Module({
  imports: [
    AiModule,
    CardsModule,
    WordAudioModule,
    SubscriptionsModule,
    TypeOrmModule.forFeature([CollectionEntity, CardEntity]),
    forwardRef(() => WordDictionaryModule),
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
  exports: [WordEnrichService],
})
export class ImportModule {}
