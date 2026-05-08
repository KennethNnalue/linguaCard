import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedService } from './seed.service';
import { CardEntity } from '../cards/card.entity';
import { CollectionEntity } from '../collections/collection.entity';
import { CategoryEntity } from '../categories/category.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CardEntity, CollectionEntity, CategoryEntity])],
  providers: [SeedService],
})
export class SeedModule {}
