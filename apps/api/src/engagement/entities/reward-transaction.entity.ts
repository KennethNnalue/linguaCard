import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type RewardReason =
  | 'first_daily_card_review'
  | 'recovered_card_review'
  | 'daily_goal_completed'
  | 'earned_card_mastery'
  | 'podcast_episode_completed'
  | 'podcast_word_retrieved'
  | 'collection_listening_completed'
  | 'story_completed';

@Entity('reward_transactions')
@Index('uq_reward_transactions_user_deduplication', ['userId', 'deduplicationKey'], { unique: true })
export class RewardTransactionEntity {
  @PrimaryColumn({ type: 'varchar' }) transactionId!: string;
  @Column({ type: 'varchar' }) userId!: string;
  @Column({ type: 'timestamptz' }) occurredAt!: Date;
  @Column({ type: 'date' }) dayKey!: string;
  @Column({ type: 'int' }) amount!: number;
  @Column({ type: 'varchar' }) reason!: RewardReason;
  @Column({ type: 'varchar' }) sourceEventId!: string;
  @Column({ type: 'varchar' }) deduplicationKey!: string;
  @Column({ type: 'varchar', nullable: true }) sessionId!: string | null;
  @Column({ type: 'varchar', nullable: true }) cardId!: string | null;
}
