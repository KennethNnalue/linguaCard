import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WordDictionaryEntity } from './word-dictionary.entity';
import { WordDictionaryRepository } from './word-dictionary.repository';
import { WordDictionaryService } from './word-dictionary.service';
import { WordDictionaryController } from './word-dictionary.controller';
import { ImportModule } from '../import/import.module';
import { WordAudioModule } from '../word-audio/word-audio.module';
import { VocabularyModule } from '../vocabulary/vocabulary.module';
import { LegacyDictionaryLexemeEntity } from '../vocabulary/entities/legacy-dictionary-lexeme.entity';
import { CanonicalDictionaryProjectionService } from './canonical-dictionary-projection.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WordDictionaryEntity, LegacyDictionaryLexemeEntity]),
    forwardRef(() => ImportModule),
    WordAudioModule,
    VocabularyModule,
  ],
  controllers: [WordDictionaryController],
  providers: [WordDictionaryRepository, WordDictionaryService, CanonicalDictionaryProjectionService],
  exports: [WordDictionaryService, WordDictionaryRepository, CanonicalDictionaryProjectionService],
})
export class WordDictionaryModule {}
