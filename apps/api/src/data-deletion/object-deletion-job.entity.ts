import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type ObjectDeletionJobStatus = 'pending' | 'processing' | 'retry' | 'completed';
export type DeletableObjectKind = 'story-audio' | 'story-image' | 'user-upload';

@Entity('object_deletion_jobs')
@Index('uq_object_deletion_jobs_storage_key', ['storageKey'], { unique: true })
@Index('idx_object_deletion_jobs_due', ['status', 'nextAttemptAt'])
export class ObjectDeletionJobEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'owner_user_id', type: 'varchar', nullable: true })
  ownerUserId!: string | null;

  @Column({ name: 'storage_key', type: 'varchar', length: 1000 })
  storageKey!: string;

  @Column({ type: 'varchar', length: 40 })
  kind!: DeletableObjectKind;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: ObjectDeletionJobStatus;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({ name: 'next_attempt_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  nextAttemptAt!: Date;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt!: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
