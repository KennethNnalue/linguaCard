import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('learning_contexts')
@Unique('uq_learning_contexts_pair', ['userId', 'sourceLanguage', 'targetLanguage'])
export class LearningContextEntity {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Index('idx_learning_contexts_user')
  @Column({ type: 'varchar' })
  userId!: string;

  @Column({ type: 'varchar', length: 10 })
  sourceLanguage!: string;

  @Column({ type: 'varchar', length: 10 })
  targetLanguage!: string;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
