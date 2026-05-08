import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import { CollectionEntity } from './collection.entity';
import { CardEntity } from '../cards/card.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CollectionEntity, CardEntity])],
  controllers: [CollectionsController],
  providers: [CollectionsService],
})
export class CollectionsModule {}
