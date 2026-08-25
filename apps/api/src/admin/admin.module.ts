import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformCollectionEntity } from './platform-collection.entity';
import { PlatformCollectionWordEntity } from './platform-collection-word.entity';
import { PlatformStoryEntity } from '../platform-stories/platform-story.entity';
import { UserStoryProgressEntity } from '../platform-stories/user-story-progress.entity';
import { WordDictionaryEntity } from '../word-dictionary/word-dictionary.entity';
import { WordDictionaryModule } from '../word-dictionary/word-dictionary.module';
import { WordAudioModule } from '../word-audio/word-audio.module';
import { StoriesModule } from '../stories/stories.module';
import { AuthModule } from '../auth/auth.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PlatformCollectionImportService } from './platform-collection-import.service';
import { PlatformCollectionImportEntity } from './platform-collection-import.entity';
import { PlatformCollectionImportController } from './platform-collection-import.controller';
import { LanguageEntity } from '../vocabulary/entities/language.entity';
import { LexemeEntity } from '../vocabulary/entities/lexeme.entity';
import { LexemeLocalizationEntity } from '../vocabulary/entities/lexeme-localization.entity';
import { SpeechAssetEntity } from '../vocabulary/entities/speech-asset.entity';
import { VocabularyModule } from '../vocabulary/vocabulary.module';
import { PlatformCollectionImportRepository } from './platform-collection-import.repository';
import { StorageService } from '../storage/storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlatformCollectionEntity,
      PlatformCollectionWordEntity,
      PlatformStoryEntity,
      UserStoryProgressEntity,
      WordDictionaryEntity,
      PlatformCollectionImportEntity,
      LanguageEntity,
      LexemeEntity,
      LexemeLocalizationEntity,
      SpeechAssetEntity,
    ]),
    WordDictionaryModule,
    WordAudioModule,
    VocabularyModule,
    StoriesModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [AdminController, PlatformCollectionImportController],
  providers: [AdminService, PlatformCollectionImportService, PlatformCollectionImportRepository, StorageService],
  exports: [AdminService],
})
export class AdminModule {}
