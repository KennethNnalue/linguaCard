import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { SpeechAssetStatus, SpeechContentKind } from '../models/vocabulary.types';

@Entity('speech_assets')
@Index('idx_speech_assets_status_retry', ['status', 'nextRetryAt'])
export class SpeechAssetEntity {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Index('uq_speech_assets_identity', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  identityKey!: string;

  @Column({ type: 'varchar', length: 10 })
  language!: string;

  @Column({ type: 'varchar', length: 1000 })
  normalizedText!: string;

  @Column({ type: 'varchar', length: 1000 })
  displayText!: string;

  @Column({ type: 'varchar', length: 100 })
  voiceKey!: string;

  @Column({ type: 'integer' })
  profileVersion!: number;

  @Column({ type: 'varchar', length: 20 })
  contentKind!: SpeechContentKind;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: SpeechAssetStatus;

  @Column({ type: 'varchar', nullable: true })
  leaseOwner!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  leaseExpiresAt!: Date | null;

  @Column({ type: 'integer', default: 0 })
  attemptCount!: number;

  @Column({ type: 'timestamptz', nullable: true })
  nextRetryAt!: Date | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  audioUrl!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  storagePath!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  mimeType!: string | null;

  @Column({ type: 'integer', default: 0 })
  durationMs!: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  checksum!: string | null;

  @Column({ type: 'text', nullable: true })
  failureReason!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
