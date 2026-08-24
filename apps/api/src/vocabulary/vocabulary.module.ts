import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExampleLocalizationEntity } from './entities/example-localization.entity';
import { ExampleSentenceEntity } from './entities/example-sentence.entity';
import { LanguageEntity } from './entities/language.entity';
import { LexemeLocalizationEntity } from './entities/lexeme-localization.entity';
import { LexemeEntity } from './entities/lexeme.entity';
import { SpeechAssetEntity } from './entities/speech-asset.entity';
import { LegacyDictionaryLexemeEntity } from './entities/legacy-dictionary-lexeme.entity';
import { LexemeIdentityService } from './domain/lexeme-identity.service';
import { SpeechIdentityService } from './domain/speech-identity.service';
import { LegacyVocabularyProjectionService } from './services/legacy-vocabulary-projection.service';
import { LegacySpeechAssetProjectionService } from './services/legacy-speech-asset-projection.service';

export const VOCABULARY_ENTITIES = [
  LanguageEntity,
  LexemeEntity,
  LexemeLocalizationEntity,
  ExampleSentenceEntity,
  ExampleLocalizationEntity,
  SpeechAssetEntity,
  LegacyDictionaryLexemeEntity,
];

@Module({
  imports: [TypeOrmModule.forFeature(VOCABULARY_ENTITIES)],
  providers: [
    LexemeIdentityService,
    SpeechIdentityService,
    LegacyVocabularyProjectionService,
    LegacySpeechAssetProjectionService,
  ],
  exports: [
    LexemeIdentityService,
    SpeechIdentityService,
    LegacyVocabularyProjectionService,
    LegacySpeechAssetProjectionService,
  ],
})
export class VocabularyModule {}
