import { Test } from '@nestjs/testing';
import { DataSource, EntityManager } from 'typeorm';
import { UserAccountDeletionService } from './user-account-deletion.service';
import { ObjectDeletionQueueService } from '../data-deletion/object-deletion-queue.service';

describe('UserAccountDeletionService', () => {
  it('deletes user-owned records and the user in one transaction', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ id: 'story-1', audioUrl: 'https://audio.lingua-card.app/stories/story-1.wav' }])
      .mockResolvedValue(undefined);
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const transaction = jest.fn(async (operation: (manager: Pick<EntityManager, 'query'>) => Promise<void>) => {
      await operation({ query });
    });
    const module = await Test.createTestingModule({
      providers: [
        UserAccountDeletionService,
        { provide: DataSource, useValue: { transaction } },
        { provide: ObjectDeletionQueueService, useValue: { enqueue } },
      ],
    }).compile();
    const service = module.get(UserAccountDeletionService);

    await service.deleteAccount('user-1', 'person@example.com');

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.any(Object),
      'user-1',
      [{ storageKey: 'stories/story-1.wav', kind: 'story-audio' }],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM "share_sync_links"'),
      ['user-1', 'person@example.com', ['story-1']],
    );
    expect(query).toHaveBeenCalledWith(
      'DELETE FROM "users" WHERE "id" = $1',
      ['user-1'],
    );
    expect(query).toHaveBeenCalledWith(
      'DELETE FROM "push_subscriptions" WHERE "user_id" = $1',
      ['user-1'],
    );
    expect(query).toHaveBeenCalledWith(
      'DELETE FROM "user_settings" WHERE "user_id" = $1',
      ['user-1'],
    );
    expect(query).toHaveBeenLastCalledWith(
      'DELETE FROM "users" WHERE "id" = $1',
      ['user-1'],
    );
  });

  it('does not delete the user when deleting associated data fails', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('database failure'));
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const transaction = jest.fn(async (operation: (manager: Pick<EntityManager, 'query'>) => Promise<void>) => {
      await operation({ query });
    });
    const module = await Test.createTestingModule({
      providers: [
        UserAccountDeletionService,
        { provide: DataSource, useValue: { transaction } },
        { provide: ObjectDeletionQueueService, useValue: { enqueue } },
      ],
    }).compile();
    const service = module.get(UserAccountDeletionService);

    await expect(service.deleteAccount('user-1', 'person@example.com'))
      .rejects.toThrow('database failure');
    expect(query).not.toHaveBeenCalledWith(
      'DELETE FROM "users" WHERE "id" = $1',
      ['user-1'],
    );
  });
});
