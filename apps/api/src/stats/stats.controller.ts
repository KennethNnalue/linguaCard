import { Controller, Get, Query } from '@nestjs/common';
import { StatsService } from './stats.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { StreakStatus, GoalProgress } from '@lingua-card/shared/domain';

@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('streak')
  streak(@CurrentUser() userId: string): Promise<StreakStatus> {
    return this.stats.computeStreak(userId);
  }

  @Get('goal-progress')
  goalProgress(
    @CurrentUser() userId: string,
    @Query('period') period: GoalProgress['period'] = 'daily',
  ): Promise<GoalProgress> {
    return this.stats.computeGoalProgress(userId, period);
  }
}
