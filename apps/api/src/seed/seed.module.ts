import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedService } from './seed.service';
import { CardEntity } from '../cards/card.entity';
import { CollectionEntity } from '../collections/collection.entity';
import { CategoryEntity } from '../categories/category.entity';
import { PlatformCollectionEntity } from '../admin/platform-collection.entity';
import { AdminModule } from '../admin/admin.module';
import { StarterCollectionsSeedService } from './starter-collections/starter-collections-seed.service';
import { UserEntity } from '../auth/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CardEntity, CollectionEntity, CategoryEntity, PlatformCollectionEntity, UserEntity]),
    AdminModule,
  ],
  providers: [SeedService, StarterCollectionsSeedService],
})
export class SeedModule {}
