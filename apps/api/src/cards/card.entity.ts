import {
  Entity, PrimaryColumn, Column, Index,
  CreateDateColumn, OneToOne, UpdateDateColumn,
} from 'typeorm';
import type { CardContent } from '@lingua-card/shared/domain';
import { ReviewSchedulingEntity } from '../review/review-scheduling.entity';

@Entity('cards')
export class CardEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  deckId!: string;

  @Column({ nullable: true, type: 'varchar' })
  collectionId!: string | null;

  @Index('idx_cards_userId')
  @Column()
  userId!: string;

  @Column()
  contextId!: string;

  @Column('jsonb')
  content!: CardContent;

  @Index('idx_cards_dictionaryWordId')
  @Column({ nullable: true, type: 'varchar' })
  dictionaryWordId!: string | null;

  @Column('text', { array: true, default: [] })
  categoryIds!: string[];

  @Column('text', { array: true, default: [] })
  tags!: string[];

  @Column({ default: 1 })
  version!: number;

  @OneToOne(() => ReviewSchedulingEntity, scheduling => scheduling.card, {
    cascade: ['insert'],
    eager: true,
  })
  scheduling!: ReviewSchedulingEntity;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
