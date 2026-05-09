import {
  Entity, PrimaryColumn, Column, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import type { CardContent, SRSStateData } from '@lingua-card/shared/domain';

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

  @Column('text', { array: true, default: [] })
  categoryIds!: string[];

  @Column('text', { array: true, default: [] })
  tags!: string[];

  @Column({ default: 1 })
  version!: number;

  @Column('jsonb', { nullable: true })
  srsState!: SRSStateData | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
