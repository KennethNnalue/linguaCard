import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import type { CardAdministrationEvent, CardAdministrationType, ReviewSchedulingState } from '@lingua-card/shared/domain';

@Entity('card_administration_events')
export class CardAdministrationEventEntity {
  @PrimaryColumn({ type: 'varchar' })
  eventId!: string;

  @Index('uq_card_administration_events_commandId', { unique: true })
  @Column({ type: 'varchar' })
  commandId!: string;

  @Index('idx_card_administration_events_userId')
  @Column({ type: 'varchar' })
  userId!: string;

  @Index('idx_card_administration_events_cardId')
  @Column({ type: 'varchar' })
  cardId!: string;

  @Column({ type: 'varchar' })
  type!: CardAdministrationType;

  @Column({ type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ type: 'jsonb' })
  event!: CardAdministrationEvent;

  @Column({ type: 'jsonb' })
  nextState!: ReviewSchedulingState;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
