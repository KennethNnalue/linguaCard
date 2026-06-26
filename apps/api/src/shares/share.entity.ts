import {
  Entity, PrimaryColumn, Column, Index,
  CreateDateColumn,
} from 'typeorm';
import type { ShareResourceType, ShareStatus, ShareSyncMode } from '@lingua-card/shared/domain';

@Entity('shares')
export class ShareEntity {
  @PrimaryColumn()
  id!: string;

  @Index('idx_shares_sender')
  @Column()
  senderUserId!: string;

  @Column()
  senderName!: string;

  @Column()
  senderEmail!: string;

  @Index('idx_shares_recipient_status')
  @Column({ nullable: true })
  recipientUserId!: string | null;

  @Column()
  recipientEmail!: string;

  @Column({ type: 'varchar', length: 20 })
  resourceType!: ShareResourceType;

  @Column()
  resourceId!: string;

  @Column()
  resourceName!: string;

  @Column({ type: 'varchar', nullable: true })
  resourceEmoji!: string | null;

  @Column({ type: 'varchar', length: 10, default: 'copy' })
  syncMode!: ShareSyncMode;

  @Column({ type: 'varchar', length: 10, default: 'pending' })
  status!: ShareStatus;

  @Column({ type: 'varchar', nullable: true })
  clonedResourceId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  respondedAt!: Date | null;
}
