import { Module } from '@nestjs/common';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';
import { SettingsModule } from '../settings/settings.module';
import { ReviewModule } from '../review/review.module';

@Module({
  imports: [SettingsModule, ReviewModule],
  providers: [StatsService],
  controllers: [StatsController],
  exports: [StatsService],
})
export class StatsModule {}
