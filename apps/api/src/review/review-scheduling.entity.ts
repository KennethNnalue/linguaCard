import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { createNewReviewSchedulingState } from '@lingua-card/shared/domain';
import type { ReviewSchedulingState } from '@lingua-card/shared/domain';
import { CardEntity } from '../cards/card.entity';

@Entity('review_scheduling')
export class ReviewSchedulingEntity {
  @PrimaryColumn()
  cardId!: string;

  @OneToOne(() => CardEntity, card => card.scheduling, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cardId' })
  card!: CardEntity;

  @Column('jsonb')
  state!: ReviewSchedulingState;

  @Column({ nullable: true, type: 'timestamptz' })
  stateUpdatedAt!: Date | null;
}

export function createNewReviewScheduling(cardId: string): Pick<ReviewSchedulingEntity, 'cardId' | 'state' | 'stateUpdatedAt'> {
  return {
    cardId,
    state: createNewReviewSchedulingState(cardId),
    stateUpdatedAt: null,
  };
}
