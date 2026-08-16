import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type StreakFreezeReason = 'granted' | 'consumed' | 'revoked' | 'expired';

@Entity('streak_freeze_transactions')
@Index('uq_streak_freeze_user_source', ['userId', 'sourceId'], { unique: true })
@Index('uq_streak_freeze_user_protected_day', ['userId', 'protectedDayKey'], { unique: true, where: `"reason" = 'consumed'` })
export class StreakFreezeTransactionEntity {
  @PrimaryColumn({ type: 'varchar' }) transactionId!: string;
  @Column({ type: 'varchar' }) userId!: string;
  @Column({ type: 'timestamptz' }) occurredAt!: Date;
  @Column({ type: 'int' }) amount!: number;
  @Column({ type: 'varchar' }) reason!: StreakFreezeReason;
  @Column({ type: 'date', nullable: true }) protectedDayKey!: string | null;
  @Column({ type: 'varchar' }) sourceId!: string;
}
