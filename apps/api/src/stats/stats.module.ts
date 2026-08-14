import { Module } from '@nestjs/common';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';
import { SettingsModule } from '../settings/settings.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReviewCommitEntity } from '../review/review-commit.entity';
import { ReviewProgressRepository } from './review-progress.repository';

@Module({
  imports: [SettingsModule, TypeOrmModule.forFeature([ReviewCommitEntity])],
  providers: [StatsService, ReviewProgressRepository],
  controllers: [StatsController],
  exports: [StatsService],
})
export class StatsModule {}
