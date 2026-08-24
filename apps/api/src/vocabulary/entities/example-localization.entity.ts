import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import type { LocalizationStatus, VocabularySource } from '../models/vocabulary.types';

@Entity('example_localizations')
@Index('idx_example_localizations_example_language', ['exampleSentenceId', 'language'])
@Unique('uq_example_localizations_version', ['exampleSentenceId', 'language', 'contentVersion'])
export class ExampleLocalizationEntity {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'varchar' })
  exampleSentenceId!: string;

  @Column({ type: 'varchar', length: 10 })
  language!: string;

  @Column({ type: 'varchar', length: 1000 })
  text!: string;

  @Column({ type: 'varchar', length: 20, default: 'ready' })
  status!: LocalizationStatus;

  @Column({ type: 'integer', default: 1 })
  contentVersion!: number;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ type: 'varchar', length: 30 })
  source!: VocabularySource;

  @Column({ type: 'varchar', length: 200, nullable: true })
  model!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
