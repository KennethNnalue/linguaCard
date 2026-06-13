import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformCollectionEntity } from '../admin/platform-collection.entity';
import { PlatformCollectionWordEntity } from '../admin/platform-collection-word.entity';
import { CollectionEntity } from '../collections/collection.entity';
import { CardEntity } from '../cards/card.entity';
import { AuthModule } from '../auth/auth.module';
import { WordDictionaryModule } from '../word-dictionary/word-dictionary.module';
import { PlatformStoriesModule } from '../platform-stories/platform-stories.module';
import { PlatformCollectionsService } from './platform-collections.service';
import { PlatformCollectionsController } from './platform-collections.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlatformCollectionEntity,
      PlatformCollectionWordEntity,
      CollectionEntity,
      CardEntity,
    ]),
    forwardRef(() => AuthModule),
    WordDictionaryModule,
    PlatformStoriesModule,
  ],
  controllers: [PlatformCollectionsController],
  providers: [PlatformCollectionsService],
  exports: [PlatformCollectionsService],
})
export class PlatformCollectionsModule {}
