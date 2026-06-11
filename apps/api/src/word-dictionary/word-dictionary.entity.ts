import {
  Entity, PrimaryColumn, Column, Index, Unique,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import type { ExampleSentence, Synonym } from '@lingua-card/shared/domain';

@Entity('word_dictionary')
@Unique('uq_word_dict_lemma_langs', ['lemmaKey', 'targetLang', 'nativeLang'])
export class WordDictionaryEntity {
  @PrimaryColumn()
  id!: string;

  @Index('idx_word_dict_lemma')
  @Column({ length: 500 })
  lemmaKey!: string;

  @Column({ length: 10, default: 'de-DE' })
  targetLang!: string;

  @Column({ length: 10, default: 'en' })
  nativeLang!: string;

  @Column({ length: 500 })
  displayText!: string;

  @Column({ nullable: true, type: 'varchar', length: 10 })
  article!: 'der' | 'die' | 'das' | null;

  @Column({ nullable: true, type: 'varchar', length: 20 })
  gender!: 'masculine' | 'feminine' | 'neuter' | null;

  @Column({ length: 500 })
  translation!: string;

  @Column({ length: 20, default: 'other' })
  wordType!: 'noun' | 'verb' | 'adjective' | 'adverb' | 'other';

  @Column({ nullable: true, type: 'varchar', length: 200 })
  phonetic!: string | null;

  @Column({ nullable: true, type: 'varchar', length: 5 })
  cefrLevel!: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | null;

  @Column({ length: 100, default: 'Other' })
  categoryName!: string;

  @Column('jsonb', { default: [] })
  examples!: ExampleSentence[];

  @Column('jsonb', { default: [] })
  synonyms!: Synonym[];

  @Column('text', { array: true, default: [] })
  plurals!: string[];

  @Index('idx_word_dict_audio')
  @Column({ nullable: true, type: 'varchar', length: 100 })
  wordAudioId!: string | null;

  @Column({ length: 30, default: 'ai-enrich' })
  source!: 'ai-enrich' | 'admin' | 'story-extract';

  @Column({ nullable: true, type: 'varchar', length: 200 })
  model!: string | null;

  @CreateDateColumn()
  enrichedAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
