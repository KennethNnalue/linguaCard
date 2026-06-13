import {
  Entity, PrimaryColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

@Entity('platform_collections')
export class PlatformCollectionEntity {
  @PrimaryColumn()
  id!: string;

  @Column({ length: 120 })
  title!: string;

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

  @Column({ default: 0 })
  wordCount!: number;

  /** Admin-set story category used to deterministically match related platform stories (LC-414). */
  @Column({ type: 'varchar', length: 40, nullable: true, default: null })
  storyCategory!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
