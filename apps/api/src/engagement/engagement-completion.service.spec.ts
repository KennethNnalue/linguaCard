import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { UserSettingsService } from '../settings/user-settings.service';
import { EngagementCompletionService } from './engagement-completion.service';

describe('EngagementCompletionService', () => {
  test('rejects collection completion without five distinct cards before writing', async () => {
    const transaction = jest.fn();
    const module = await Test.createTestingModule({
      providers: [
        EngagementCompletionService,
        { provide: DataSource, useValue: { transaction } },
        { provide: UserSettingsService, useValue: { getForUser: jest.fn() } },
      ],
    }).compile();

    await expect(module.get(EngagementCompletionService).completeCollectionListening(
      'user-1', 'collection-1', ['one', 'two', 'three', 'four', 'four'],
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  test('awards a validated collection completion using a day-stable identity', async () => {
    const execute = jest.fn(async () => ({ raw: [{ transactionId: 'reward-1' }] }));
    const values = jest.fn(() => ({ orIgnore: () => ({ returning: () => ({ execute }) }) }));
    const manager = {
      findOneBy: jest.fn(async () => ({ id: 'collection-1', userId: 'user-1' })),
      query: jest.fn(async () => [{ count: 5 }]),
      getRepository: jest.fn(() => ({ createQueryBuilder: () => ({ insert: () => ({ values }) }) })),
    };
    const transaction = jest.fn(async callback => callback(manager));
    const module = await Test.createTestingModule({
      providers: [
        EngagementCompletionService,
        { provide: DataSource, useValue: { transaction } },
        { provide: UserSettingsService, useValue: {
          getForUser: jest.fn(async () => ({ timezone: 'Europe/Berlin' })),
        } },
      ],
    }).compile();

    await expect(module.get(EngagementCompletionService).completeCollectionListening(
      'user-1', 'collection-1', ['one', 'two', 'three', 'four', 'five'],
    )).resolves.toEqual({ pointsAwarded: 5 });
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'collection_listening_completed', amount: 5,
    }));
  });

  test('requires complete canonical sentence coverage before awarding a story', async () => {
    const execute = jest.fn(async () => ({ raw: [{ transactionId: 'reward-1' }] }));
    const manager = {
      findOneBy: jest.fn(async () => ({
        id: 'story-1', userId: 'user-1', sentences: [{ index: 0 }, { index: 1 }],
      })),
      getRepository: jest.fn(() => ({
        createQueryBuilder: () => ({ insert: () => ({
          values: () => ({ orIgnore: () => ({ returning: () => ({ execute }) }) }),
        }) }),
      })),
    };
    const transaction = jest.fn(async callback => callback(manager));
    const module = await Test.createTestingModule({
      providers: [
        EngagementCompletionService,
        { provide: DataSource, useValue: { transaction } },
        { provide: UserSettingsService, useValue: {
          getForUser: jest.fn(async () => ({ timezone: 'Europe/Berlin' })),
        } },
      ],
    }).compile();
    const service = module.get(EngagementCompletionService);

    await expect(service.completeStory('user-1', 'story-1', [0]))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.completeStory('user-1', 'story-1', [0, 1]))
      .resolves.toEqual({ pointsAwarded: 8 });
  });
});
