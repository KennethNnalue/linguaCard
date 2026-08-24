import {
  Entity, PrimaryColumn, Column, CreateDateColumn, Index, UpdateDateColumn,
} from 'typeorm';

@Entity('platform_collections')
export class PlatformCollectionEntity {
  @PrimaryColumn()
  id!: string;

  @Column({ length: 120 })
  title!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  externalId!: string | null;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column({ type: 'varchar', length: 10, default: 'en' })
  sourceLanguage!: string;

  @Column({ type: 'varchar', length: 10, default: 'de' })
  targetLanguage!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  coverSeed!: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  coverImageUrl!: string | null;

  @Column({ length: 4, nullable: true, type: 'varchar' })
  emoji!: string | null;

  @Index('idx_platform_collections_level')
  @Column({ length: 4 })
  level!: string;

  @Index('idx_platform_collections_topic')
  @Column({ length: 80 })
  topic!: string;

  @Column({ default: false })
  isPublished!: boolean;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status!: 'draft' | 'published' | 'archived';

  @Column({ default: 0 })
  wordCount!: number;

  /** Admin-set story category used to deterministically match related platform stories (LC-414). */
  @Column({ type: 'varchar', length: 40, nullable: true, default: null })
  storyCategory!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;
}
