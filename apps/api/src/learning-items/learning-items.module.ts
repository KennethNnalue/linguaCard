import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectionMembershipEntity } from './entities/collection-membership.entity';
import { LearningContextEntity } from './entities/learning-context.entity';
import { LearningItemEntity } from './entities/learning-item.entity';
import { LearningItemsV2Controller } from './controllers/learning-items-v2.controller';
import { VaultV2Controller } from './controllers/vault-v2.controller';
import {
  LEARNING_ITEM_READ_REPOSITORY,
  LearningItemReadRepository,
} from './repositories/learning-item-read.repository';
import { LearningItemReadService } from './services/learning-item-read.service';
import { AuthModule } from '../auth/auth.module';

export const LEARNING_ITEM_ENTITIES = [
  LearningContextEntity,
  LearningItemEntity,
  CollectionMembershipEntity,
];

@Module({
  imports: [TypeOrmModule.forFeature(LEARNING_ITEM_ENTITIES), AuthModule],
  controllers: [LearningItemsV2Controller, VaultV2Controller],
  providers: [
    LearningItemReadRepository,
    {
      provide: LEARNING_ITEM_READ_REPOSITORY,
      useExisting: LearningItemReadRepository,
    },
    LearningItemReadService,
  ],
  exports: [LearningItemReadService],
})
export class LearningItemsModule {}
