import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { describe, expect, jest, test } from '@jest/globals';
import { ReviewProgressRepository } from './review-progress.repository';
import { StatsService } from './stats.service';
import { UserSettingsService } from '../settings/user-settings.service';

describe('StatsService committed-review projections', () => {
  const settings = {
    dailyGoal: 2,
    weeklyGoal: 10,
    monthlyGoal: 40,
    timezone: 'Europe/Berlin',
  };

  async function createService(progress: ReturnType<ReviewProgressRepository['dailyProgress']>): Promise<StatsService> {
    const getForUser = jest.fn<() => Promise<typeof settings>>(async () => settings);
    const dailyProgress = jest.fn<ReviewProgressRepository['dailyProgress']>(() => progress);
    const module = await Test.createTestingModule({
      providers: [
        StatsService,
        { provide: UserSettingsService, useValue: { getForUser } },
        { provide: ReviewProgressRepository, useValue: { dailyProgress } },
      ],
    }).compile();
    return module.get(StatsService);
  }

  test('uses unique committed cards for goal progress', async () => {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: settings.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const service = await createService(Promise.resolve([{
      dayKey: today,
      committedReviews: 3,
      uniqueCardsReviewed: 2,
    }]));

    await expect(service.computeGoalProgress('user-1', 'daily')).resolves.toEqual({
      period: 'daily', reviewed: 2, goal: 2, metGoal: true,
    });
  });

  test('does not derive progress from completed review sessions', async () => {
    const service = await createService(Promise.resolve([]));

    await expect(service.computeGoalProgress('user-1', 'daily')).resolves.toEqual({
      period: 'daily', reviewed: 0, goal: 2, metGoal: false,
    });
  });
});
