import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { ReviewSessionEntity } from './review-session.entity';
import { ReviewHistoryClearanceEntity } from './review-history-clearance.entity';
import { ReviewSessionsService } from './review-sessions.service';

describe('ReviewSessionsService history retention', () => {
  const getMany = jest.fn();
  const execute = jest.fn();
  const query = {
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany,
    delete: jest.fn().mockReturnThis(),
    execute,
  };
  const createQueryBuilder = jest.fn().mockReturnValue(query);
  const remove = jest.fn();
  const findClearance = jest.fn();
  const saveClearance = jest.fn();
  let service: ReviewSessionsService;

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-13T12:00:00.000Z'));
    getMany.mockReset();
    execute.mockReset().mockResolvedValue({ affected: 0 });
    remove.mockReset().mockResolvedValue({ affected: 0 });
    findClearance.mockReset().mockResolvedValue(null);
    saveClearance.mockReset().mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      providers: [
        ReviewSessionsService,
        { provide: getRepositoryToken(ReviewSessionEntity), useValue: { createQueryBuilder, delete: remove } },
        { provide: getRepositoryToken(ReviewHistoryClearanceEntity), useValue: { findOneBy: findClearance, upsert: saveClearance } },
      ],
    }).compile();
    service = module.get(ReviewSessionsService);
  });

  afterEach(() => jest.useRealTimers());

  it('only queries sessions in the last three months for the signed-in user', async () => {
    getMany.mockResolvedValue([]);

    await service.findRecent('user-1', 900);

    expect(query.where).toHaveBeenCalledWith('session."userId" = :userId', { userId: 'user-1' });
    expect(query.andWhere).toHaveBeenCalledWith('session."startedAt"::timestamptz >= :cutoff', {
      cutoff: '2026-06-13T12:00:00.000Z',
    });
    expect(query.andWhere).toHaveBeenCalledWith(
      '(clearance."clearedAt" IS NULL OR session."startedAt"::timestamptz > clearance."clearedAt")',
    );
    expect(query.limit).toHaveBeenCalledWith(500);
  });

  it('clears only the signed-in user’s session history', async () => {
    await service.clearHistory('user-1');
    expect(saveClearance).toHaveBeenCalledWith({ userId: 'user-1', clearedAt: new Date('2026-09-13T12:00:00.000Z') }, ['userId']);
    expect(remove).toHaveBeenCalledWith({ userId: 'user-1' });
  });

  it('deletes expired sessions during the daily sweep', async () => {
    await service.removeExpired();
    expect(query.delete).toHaveBeenCalled();
    expect(query.where).toHaveBeenCalledWith(expect.stringContaining('"startedAt"::timestamptz < :cutoff'), {
      cutoff: '2026-06-13T12:00:00.000Z',
    });
    expect(execute).toHaveBeenCalled();
  });

  it('does not accept expired sessions from delayed offline sync', async () => {
    await expect(service.upsertBatch('user-1', [{
      id: 'old-session',
      startedAt: '2026-06-12T12:00:00.000Z',
      completedAt: '2026-06-12T12:10:00.000Z',
      totalCards: 1,
      reviewedCards: 1,
      ratings: { 'card-1': 'good' },
    }])).resolves.toEqual({ upserted: 0 });
    await expect(service.upsert('user-1', {
      id: 'old-session',
      startedAt: '2026-06-12T12:00:00.000Z',
      completedAt: '2026-06-12T12:10:00.000Z',
      totalCards: 1,
      reviewedCards: 1,
      ratings: { 'card-1': 'good' },
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ignores sessions queued on another device before history was cleared', async () => {
    findClearance.mockResolvedValue({ userId: 'user-1', clearedAt: new Date('2026-09-12T12:00:00.000Z') });
    await expect(service.upsertBatch('user-1', [{
      id: 'queued-session',
      startedAt: '2026-09-11T12:00:00.000Z',
      completedAt: '2026-09-11T12:10:00.000Z',
      totalCards: 1,
      reviewedCards: 1,
      ratings: { 'card-1': 'good' },
    }])).resolves.toEqual({ upserted: 0 });
  });
});
