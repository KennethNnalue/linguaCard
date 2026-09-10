import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { StorageService } from '../storage/storage.service';

const BATCH_SIZE = 25;
const STALE_LOCK_MINUTES = 15;
const MAX_RETRY_DELAY_MINUTES = 24 * 60;
const COMPLETED_JOB_RETENTION_DAYS = 30;

interface ClaimedDeletionJob {
  id: string;
  storageKey: string;
  attempts: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isClaimedDeletionJob(value: unknown): value is ClaimedDeletionJob {
  return isRecord(value)
    && typeof value['id'] === 'string'
    && typeof value['storageKey'] === 'string'
    && typeof value['attempts'] === 'number';
}

function claimedDeletionJobs(value: unknown): ClaimedDeletionJob[] {
  if (!Array.isArray(value)) return [];
  const rows = Array.isArray(value[0]) ? value[0] : value;
  return rows.filter(isClaimedDeletionJob);
}

@Injectable()
export class ObjectDeletionProcessorService {
  private readonly logger = new Logger(ObjectDeletionProcessorService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: StorageService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processDueJobs(): Promise<void> {
    const jobs = await this.claimDueJobs();
    for (const job of jobs) {
      await this.processJob(job);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeCompletedJobs(): Promise<void> {
    await this.dataSource.query(
      `DELETE FROM "object_deletion_jobs"
       WHERE "status" = 'completed'
         AND "completed_at" < NOW() - INTERVAL '${COMPLETED_JOB_RETENTION_DAYS} days'`,
    );
  }

  private async claimDueJobs(): Promise<ClaimedDeletionJob[]> {
    const result: unknown = await this.dataSource.transaction(manager =>
      manager.query(
        `UPDATE "object_deletion_jobs"
         SET "status" = 'processing', "locked_at" = NOW(), "updated_at" = NOW()
         WHERE "id" IN (
           SELECT "id" FROM "object_deletion_jobs"
           WHERE (
             ("status" IN ('pending', 'retry') AND "next_attempt_at" <= NOW())
             OR ("status" = 'processing' AND "locked_at" < NOW() - INTERVAL '${STALE_LOCK_MINUTES} minutes')
           )
           ORDER BY "next_attempt_at" ASC
           FOR UPDATE SKIP LOCKED
           LIMIT $1
         )
         RETURNING "id", "owner_user_id" AS "ownerUserId",
                   "storage_key" AS "storageKey", "kind", "status", "attempts",
                   "next_attempt_at" AS "nextAttemptAt", "locked_at" AS "lockedAt",
                   "last_error" AS "lastError", "completed_at" AS "completedAt",
                   "created_at" AS "createdAt", "updated_at" AS "updatedAt"`,
        [BATCH_SIZE],
      ),
    );
    return claimedDeletionJobs(result);
  }

  private async processJob(job: ClaimedDeletionJob): Promise<void> {
    try {
      await this.storage.deleteOrThrow(job.storageKey);
      await this.dataSource.query(
        `UPDATE "object_deletion_jobs"
         SET "status" = 'completed', "completed_at" = NOW(), "locked_at" = NULL,
             "owner_user_id" = NULL,
             "last_error" = NULL, "updated_at" = NOW()
         WHERE "id" = $1`,
        [job.id],
      );
    } catch (error: unknown) {
      const attempts = job.attempts + 1;
      const delayMinutes = Math.min(2 ** Math.min(attempts, 10), MAX_RETRY_DELAY_MINUTES);
      const message = error instanceof Error ? error.message : 'Unknown storage deletion error';
      await this.dataSource.query(
        `UPDATE "object_deletion_jobs"
         SET "status" = 'retry', "attempts" = $2,
             "next_attempt_at" = NOW() + ($3 * INTERVAL '1 minute'),
             "locked_at" = NULL, "last_error" = $4, "updated_at" = NOW()
         WHERE "id" = $1`,
        [job.id, attempts, delayMinutes, message.slice(0, 2000)],
      );
      this.logger.warn(`Object deletion ${job.id} failed on attempt ${attempts}: ${message}`);
    }
  }
}
