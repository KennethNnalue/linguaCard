import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import type { VocabularySource } from '../models/vocabulary.types';

@Entity('example_sentences')
@Unique('uq_example_sentences_identity', ['lexemeId', 'language', 'normalizedText'])
export class ExampleSentenceEntity {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Index('idx_example_sentences_lexeme')
  @Column({ type: 'varchar' })
  lexemeId!: string;

  @Column({ type: 'varchar', length: 10 })
  language!: string;

  @Column({ type: 'varchar', length: 1000 })
  normalizedText!: string;

  @Column({ type: 'varchar', length: 1000 })
  displayText!: string;

  @Column({ type: 'integer', default: 0 })
  position!: number;

  @Column({ type: 'varchar', length: 30 })
  source!: VocabularySource;

  @Column({ type: 'varchar', length: 200, nullable: true })
  model!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
