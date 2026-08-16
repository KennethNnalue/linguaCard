import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PushSubscriptionEntity } from './push-subscription.entity';
import { PushService } from './push.service';
import { PushController } from './push.controller';
import { PushConfig } from './push.config';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { SettingsModule } from '../settings/settings.module';
import { EngagementModule } from '../engagement/engagement.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PushSubscriptionEntity]),
    ConfigModule,
    SettingsModule,
    EngagementModule,
  ],
  providers: [PushConfig, PushService, ReminderSchedulerService],
  controllers: [PushController],
  exports: [PushService],
})
export class PushModule {}
