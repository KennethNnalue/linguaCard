import {
  Entity, PrimaryColumn, Column, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import type { RawExtractedWord } from '@lingua-card/shared/domain';

@Entity('collections')
export class CollectionEntity {
  @PrimaryColumn()
  id!: string;

  @Index('idx_collections_userId')
  @Column()
  userId!: string;

  @Column()
  name!: string;

  @Column({ default: '' })
  description!: string;

  @Column({ default: '📚' })
  emoji!: string;

  @Column({ default: '#2D5A4E' })
  colour!: string;

  @Column()
  contextId!: string;

  @Index('idx_collections_learningContextId')
  @Column({ type: 'varchar', nullable: true, default: null })
  learningContextId!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true, default: null })
  coverSeed!: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true, default: null })
  coverImageUrl!: string | null;

  @Column({ default: 0 })
  cardCount!: number;

  @Column({ default: 0 })
  masteredCount!: number;

  @Column({ default: 0 })
  dueCount!: number;

  @Column({ default: false })
  isDefault!: boolean;

  @Column({ type: 'varchar', default: 'complete' })
  importStatus!: string;

  @Column({ type: 'jsonb', default: '[]' })
  pendingWords!: RawExtractedWord[];

  @Column({ type: 'varchar', nullable: true, default: null })
  sourceImageDescription!: string | null;

  /** Set when this collection was adopted from a platform collection (LC-405). */
  @Index('idx_collections_sourcePlatformCollectionId')
  @Column({ type: 'varchar', nullable: true, default: null })
  sourcePlatformCollectionId!: string | null;

  /** CEFR level carried from the source platform collection; null for hand-authored sets (LC-405). */
  @Column({ type: 'varchar', length: 4, nullable: true, default: null })
  level!: string | null;

  /** Topic carried from the source platform collection; null for hand-authored sets (LC-405). */
  @Column({ type: 'varchar', length: 80, nullable: true, default: null })
  topic!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
