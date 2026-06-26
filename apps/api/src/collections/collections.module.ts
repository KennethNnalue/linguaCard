import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import { CollectionEntity } from './collection.entity';
import { CardEntity } from '../cards/card.entity';
import { SharesModule } from '../shares/shares.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CollectionEntity, CardEntity]),
    forwardRef(() => SharesModule),
  ],
  controllers: [CollectionsController],
  providers: [CollectionsService],
})
export class CollectionsModule {}
