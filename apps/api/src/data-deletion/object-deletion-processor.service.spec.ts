import { DataSource } from 'typeorm';
import { StorageService } from '../storage/storage.service';
import { ObjectDeletionJobEntity } from './object-deletion-job.entity';
import { ObjectDeletionProcessorService } from './object-deletion-processor.service';

function createJob(): ObjectDeletionJobEntity {
  const now = new Date('2026-09-04T12:00:00.000Z');
  return {
    id: 'a1797e6d-c017-4f8d-92ce-859349d631b0',
    ownerUserId: 'user-1',
    storageKey: 'stories/story-1.wav',
    kind: 'story-audio',
    status: 'processing',
    attempts: 0,
    nextAttemptAt: now,
    lockedAt: now,
    lastError: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('ObjectDeletionProcessorService', () => {
  it('marks a claimed object as completed after storage deletion', async () => {
    const job = createJob();
    const dataSource = new DataSource({ type: 'postgres' });
    jest.spyOn(dataSource, 'transaction').mockResolvedValue([job]);
    jest.spyOn(dataSource, 'query').mockResolvedValue([]);
    const storage = Object.create(StorageService.prototype) as StorageService;
    storage.deleteOrThrow = jest.fn().mockResolvedValue(undefined);
    const service = new ObjectDeletionProcessorService(dataSource, storage);

    await service.processDueJobs();

    expect(storage.deleteOrThrow).toHaveBeenCalledWith('stories/story-1.wav');
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('"status" = \'completed\''),
      [job.id],
    );
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('"owner_user_id" = NULL'),
      [job.id],
    );
  });

  it('schedules a retry when storage deletion fails', async () => {
    const job = createJob();
    const dataSource = new DataSource({ type: 'postgres' });
    jest.spyOn(dataSource, 'transaction').mockResolvedValue([job]);
    jest.spyOn(dataSource, 'query').mockResolvedValue([]);
    const storage = Object.create(StorageService.prototype) as StorageService;
    storage.deleteOrThrow = jest.fn().mockRejectedValue(new Error('R2 unavailable'));
    const service = new ObjectDeletionProcessorService(dataSource, storage);

    await service.processDueJobs();

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('"status" = \'retry\''),
      [job.id, 1, 2, 'R2 unavailable'],
    );
  });

  it('purges completed audit jobs after the retention period', async () => {
    const dataSource = new DataSource({ type: 'postgres' });
    const query = jest.spyOn(dataSource, 'query').mockResolvedValue([]);
    const storage = Object.create(StorageService.prototype) as StorageService;
    const service = new ObjectDeletionProcessorService(dataSource, storage);

    await service.purgeCompletedJobs();

    expect(query).toHaveBeenCalledWith(expect.stringContaining("INTERVAL '30 days'"));
  });
});
