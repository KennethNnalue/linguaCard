import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import type { ReviewRating } from '@lingua-card/shared/domain';

@Entity('review_sessions')
export class ReviewSessionEntity {
  @PrimaryColumn()
  id!: string;

  @Index('idx_review_sessions_userId')
  @Column()
  userId!: string;

  @Column()
  deckId!: string;

  @Column({ nullable: true, type: 'varchar' })
  collectionId!: string | null;

  @Column({ nullable: true, type: 'varchar' })
  collectionName!: string | null;

  @Column()
  startedAt!: string;

  @Column({ nullable: true, type: 'varchar' })
  completedAt!: string | null;

  @Column({ default: 0 })
  totalCards!: number;

  @Column({ default: 0 })
  reviewedCards!: number;

  @Column({ default: 0 })
  newCards!: number;

  /** cardId → committed review rating */
  @Column('jsonb', { default: {} })
  ratings!: Record<string, ReviewRating>;

  @CreateDateColumn()
  createdAt!: Date;
}
