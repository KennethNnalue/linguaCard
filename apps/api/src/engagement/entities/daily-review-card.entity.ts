import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('daily_review_cards')
export class DailyReviewCardEntity {
  @PrimaryColumn({ type: 'varchar' }) userId!: string;
  @PrimaryColumn({ type: 'date' }) dayKey!: string;
  @PrimaryColumn({ type: 'varchar' }) cardId!: string;
  @Column({ type: 'varchar' }) sourceEventId!: string;
  @CreateDateColumn() createdAt!: Date;
}
