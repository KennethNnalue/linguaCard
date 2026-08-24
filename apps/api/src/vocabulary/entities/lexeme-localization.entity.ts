import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import type {
  LegacyVocabularySynonymInput,
  LocalizationStatus,
  VocabularySource,
} from '../models/vocabulary.types';

@Entity('lexeme_localizations')
@Index('idx_lexeme_localizations_lexeme_language', ['lexemeId', 'language'])
@Unique('uq_lexeme_localizations_version', ['lexemeId', 'language', 'contentVersion'])
export class LexemeLocalizationEntity {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'varchar' })
  lexemeId!: string;

  @Column({ type: 'varchar', length: 10 })
  language!: string;

  @Column({ type: 'varchar', length: 500 })
  translation!: string;

  @Column({ type: 'text', nullable: true })
  definition!: string | null;

  @Column({ type: 'jsonb', default: [] })
  synonyms!: LegacyVocabularySynonymInput[];

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
