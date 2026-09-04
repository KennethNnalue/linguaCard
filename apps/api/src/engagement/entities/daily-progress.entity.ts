import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('daily_progress')
export class DailyProgressEntity {
  @PrimaryColumn({ type: 'varchar' }) userId!: string;
  @PrimaryColumn({ type: 'date' }) dayKey!: string;
  @Column({ type: 'int', default: 0 }) streakPolicyVersion!: number;
  @Column({ type: 'int' }) targetUniqueCards!: number;
  @Column({ type: 'int', default: 0 }) uniqueCardsReviewed!: number;
  @Column({ type: 'int', default: 0 }) committedReviewCount!: number;
  @Column({ type: 'timestamptz', nullable: true }) goalReachedAt!: Date | null;
  @Column({ type: 'varchar', nullable: true }) firstGoalReachingEventId!: string | null;
}
