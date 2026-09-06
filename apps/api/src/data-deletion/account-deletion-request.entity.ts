import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type AccountDeletionRequestStatus = 'pending' | 'completed';

@Entity('account_deletion_requests')
@Index('uq_account_deletion_requests_pending_user', ['userId'], {
  unique: true,
  where: '"status" = \'pending\'',
})
export class AccountDeletionRequestEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'varchar' })
  userId!: string;

  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: AccountDeletionRequestStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
