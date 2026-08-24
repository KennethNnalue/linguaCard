import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import type { LexemeGrammar, VocabularySource } from '../models/vocabulary.types';

@Entity('lexemes')
@Index('idx_lexemes_language_lemma', ['language', 'normalizedLemma'])
@Unique('uq_lexemes_identity', [
  'language',
  'normalizedLemma',
  'partOfSpeech',
  'grammarDiscriminator',
])
export class LexemeEntity {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'varchar', length: 10 })
  language!: string;

  @Column({ type: 'varchar', length: 500 })
  normalizedLemma!: string;

  @Column({ type: 'varchar', length: 500 })
  displayText!: string;

  @Column({ type: 'varchar', length: 40, default: 'other' })
  partOfSpeech!: string;

  @Column({ type: 'varchar', length: 200, default: '' })
  grammarDiscriminator!: string;

  @Column({ type: 'jsonb', default: {} })
  grammar!: LexemeGrammar;

  @Column({ type: 'varchar', length: 200, nullable: true })
  phonetic!: string | null;

  @Column({ type: 'varchar', length: 5, nullable: true })
  cefrLevel!: string | null;

  @Column({ type: 'varchar', length: 30 })
  source!: VocabularySource;

  @Column({ type: 'varchar', length: 200, nullable: true })
  model!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
