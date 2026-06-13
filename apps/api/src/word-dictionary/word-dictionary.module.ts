import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WordDictionaryEntity } from './word-dictionary.entity';
import { WordDictionaryRepository } from './word-dictionary.repository';
import { WordDictionaryService } from './word-dictionary.service';
import { WordDictionaryController } from './word-dictionary.controller';
import { ImportModule } from '../import/import.module';
import { WordAudioModule } from '../word-audio/word-audio.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WordDictionaryEntity]),
    forwardRef(() => ImportModule),
    WordAudioModule,
  ],
  controllers: [WordDictionaryController],
  providers: [WordDictionaryRepository, WordDictionaryService],
  exports: [WordDictionaryService, WordDictionaryRepository],
})
export class WordDictionaryModule {}
