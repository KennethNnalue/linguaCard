import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('review_commits')
@Index('idx_review_commits_userId_reviewedAt', ['userId', 'reviewedAt'])
export class ReviewCommitEntity {
  @PrimaryColumn({ type: 'varchar' })
  eventId!: string;

  @Index('uq_review_commits_attemptId', { unique: true })
  @Column({ type: 'varchar' })
  attemptId!: string;

  @Index('idx_review_commits_userId')
  @Column({ type: 'varchar' })
  userId!: string;

  @Index('idx_review_commits_cardId')
  @Column({ type: 'varchar' })
  cardId!: string;

  @Column({ type: 'varchar' })
  reviewId!: string;

  @Column({ type: 'varchar' })
  sessionId!: string;

  @Column({ type: 'timestamptz' })
  reviewedAt!: Date;

  @Column('jsonb')
  event!: object;

  @Column('jsonb')
  record!: object;

  @Column('jsonb')
  nextState!: object;

  @CreateDateColumn()
  createdAt!: Date;
}
