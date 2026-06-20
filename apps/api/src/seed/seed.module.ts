import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedService } from './seed.service';
import { CardEntity } from '../cards/card.entity';
import { CollectionEntity } from '../collections/collection.entity';
import { CategoryEntity } from '../categories/category.entity';
import { PlatformCollectionEntity } from '../admin/platform-collection.entity';
import { AdminModule } from '../admin/admin.module';
import { StarterCollectionsSeedService } from './starter-collections/starter-collections-seed.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CardEntity, CollectionEntity, CategoryEntity, PlatformCollectionEntity]),
    AdminModule,
  ],
  providers: [SeedService, StarterCollectionsSeedService],
})
export class SeedModule {}
