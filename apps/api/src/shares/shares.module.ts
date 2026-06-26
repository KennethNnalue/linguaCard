import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShareEntity } from './share.entity';
import { ShareSyncLinkEntity } from './share-sync-link.entity';
import { UserEntity } from '../auth/user.entity';
import { CollectionEntity } from '../collections/collection.entity';
import { CardEntity } from '../cards/card.entity';
import { StoryEntity } from '../stories/story.entity';
import { UserSettingsEntity } from '../settings/user-settings.entity';
import { AuthModule } from '../auth/auth.module';
import { PushModule } from '../push/push.module';
import { SharesService } from './shares.service';
import { ShareSyncService } from './share-sync.service';
import { SharesController } from './shares.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ShareEntity,
      ShareSyncLinkEntity,
      UserEntity,
      CollectionEntity,
      CardEntity,
      StoryEntity,
      UserSettingsEntity,
    ]),
    forwardRef(() => AuthModule),
    PushModule,
  ],
  controllers: [SharesController],
  providers: [SharesService, ShareSyncService],
  exports: [SharesService, ShareSyncService],
})
export class SharesModule {}
