import {
  Entity, PrimaryColumn, Column, Index,
  CreateDateColumn,
} from 'typeorm';
import type { ShareResourceType } from '@lingua-card/shared/domain';

@Entity('share_sync_links')
export class ShareSyncLinkEntity {
  @PrimaryColumn()
  id!: string;

  @Index('idx_sync_links_share')
  @Column()
  shareId!: string;

  @Index('idx_sync_links_source')
  @Column()
  sourceResourceId!: string;

  @Column()
  targetResourceId!: string;

  @Column({ type: 'varchar', length: 20 })
  resourceType!: ShareResourceType;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
