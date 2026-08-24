import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('learning_items')
@Unique('uq_learning_items_user_context_lexeme', ['userId', 'learningContextId', 'lexemeId'])
export class LearningItemEntity {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Index('idx_learning_items_user_context')
  @Column({ type: 'varchar' })
  userId!: string;

  @Column({ type: 'varchar' })
  learningContextId!: string;

  @Index('idx_learning_items_lexeme')
  @Column({ type: 'varchar' })
  lexemeId!: string;

  @Index('uq_learning_items_legacy_card', { unique: true })
  @Column({ type: 'varchar', nullable: true })
  legacyCardId!: string | null;

  @Column({ type: 'text', default: '' })
  personalNote!: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  customImageUrl!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
