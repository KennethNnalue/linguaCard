import { CreateDateColumn, Entity, Index, PrimaryColumn, Column } from 'typeorm';

@Entity('legacy_dictionary_lexemes')
export class LegacyDictionaryLexemeEntity {
  @PrimaryColumn({ type: 'varchar' })
  dictionaryWordId!: string;

  @Index('idx_legacy_dictionary_lexemes_lexeme')
  @Column({ type: 'varchar' })
  lexemeId!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
