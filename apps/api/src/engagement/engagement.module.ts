import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsModule } from '../settings/settings.module';
import { DailyProgressEntity } from './entities/daily-progress.entity';
import { DailyReviewCardEntity } from './entities/daily-review-card.entity';
import { EngagementProcessedEventEntity } from './entities/engagement-processed-event.entity';
import { RewardTransactionEntity } from './entities/reward-transaction.entity';
import { StreakFreezeTransactionEntity } from './entities/streak-freeze-transaction.entity';
import { EngagementController } from './engagement.controller';
import { EngagementDashboardService } from './engagement-dashboard.service';
import { EngagementProjectionService } from './engagement-projection.service';
import { StreakFreezeReconciliationService } from './streak-freeze-reconciliation.service';

export const ENGAGEMENT_ENTITIES = [
  EngagementProcessedEventEntity, DailyReviewCardEntity, DailyProgressEntity,
  RewardTransactionEntity, StreakFreezeTransactionEntity,
] as const;

@Module({
  imports: [SettingsModule, TypeOrmModule.forFeature([...ENGAGEMENT_ENTITIES])],
  controllers: [EngagementController],
  providers: [EngagementProjectionService, EngagementDashboardService, StreakFreezeReconciliationService],
  exports: [EngagementProjectionService, EngagementDashboardService],
})
export class EngagementModule {}
