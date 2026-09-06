import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import { DeletableObjectKind, ObjectDeletionJobEntity } from './object-deletion-job.entity';

export interface ObjectDeletionRequest {
  storageKey: string;
  kind: DeletableObjectKind;
}

@Injectable()
export class ObjectDeletionQueueService {
  async enqueue(
    manager: EntityManager,
    ownerUserId: string,
    requests: readonly ObjectDeletionRequest[],
  ): Promise<void> {
    if (requests.length === 0) return;

    const uniqueRequests = new Map(requests.map(request => [request.storageKey, request]));
    const repository = manager.getRepository(ObjectDeletionJobEntity);
    const jobs = [...uniqueRequests.values()].map(request => repository.create({
      id: randomUUID(),
      ownerUserId,
      storageKey: request.storageKey,
      kind: request.kind,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: new Date(),
      lockedAt: null,
      lastError: null,
      completedAt: null,
    }));

    await repository.upsert(jobs, ['storageKey']);
  }
}
