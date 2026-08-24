import {
  Entity, PrimaryColumn, Column, Index, CreateDateColumn,
} from 'typeorm';

@Entity('platform_collection_words')
export class PlatformCollectionWordEntity {
  @PrimaryColumn()
  id!: string;

  @Index('idx_pcw_collection')
  @Column()
  platformCollectionId!: string;

  @Index('idx_pcw_dictionary')
  @Column()
  dictionaryWordId!: string;

  @Index('idx_pcw_lexeme')
  @Column({ type: 'varchar', nullable: true })
  lexemeId!: string | null;

  @Column({ default: 0 })
  position!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
