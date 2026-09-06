import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { StorageService } from '../storage/storage.service';
import { ObjectDeletionJobEntity } from './object-deletion-job.entity';

const BATCH_SIZE = 25;
const STALE_LOCK_MINUTES = 15;
const MAX_RETRY_DELAY_MINUTES = 24 * 60;
const COMPLETED_JOB_RETENTION_DAYS = 30;

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

  private async claimDueJobs(): Promise<ObjectDeletionJobEntity[]> {
    return this.dataSource.transaction(async manager => {
      const rows: ObjectDeletionJobEntity[] = await manager.query(
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
      );
      return rows;
    });
  }

  private async processJob(job: ObjectDeletionJobEntity): Promise<void> {
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
