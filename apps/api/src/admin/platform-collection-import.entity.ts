import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { AdminPlatformCollectionImportPayload } from '@lingua-card/shared/domain';

@Entity('platform_collection_imports')
export class PlatformCollectionImportEntity {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Index('uq_platform_collection_imports_fingerprint', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  fingerprint!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: 'ready_to_import' | 'importing' | 'ready_to_publish' | 'needs_attention' | 'failed';

  @Column({ type: 'varchar', nullable: true })
  collectionId!: string | null;

  @Column({ type: 'varchar', length: 120 })
  title!: string;

  @Column({ type: 'integer', default: 0 })
  inserted!: number;

  @Column({ type: 'integer', default: 0 })
  reused!: number;

  @Column({ type: 'integer', default: 0 })
  audioLinked!: number;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ type: 'varchar', length: 30, default: 'queued' })
  stage!: 'queued' | 'resolve_vocabulary' | 'prepare_audio' | 'commit_collection' | 'complete' | 'failed';

  @Column({ type: 'integer', default: 0 })
  processedItems!: number;

  @Column({ type: 'integer', default: 0 })
  totalItems!: number;

  @Column({ type: 'jsonb', default: [] })
  rowErrors!: Array<{ itemIndex: number | null; message: string }>;

  @Column({ type: 'jsonb', nullable: true })
  payload!: AdminPlatformCollectionImportPayload | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
