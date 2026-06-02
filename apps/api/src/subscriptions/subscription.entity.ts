import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { UserEntity } from '../auth/user.entity';
import type { SubscriptionTier } from '@lingua-card/shared/domain';

@Entity('subscriptions')
export class SubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ type: 'varchar', length: 20, default: 'free' })
  tier!: SubscriptionTier;

  @Column({ name: 'activated_at', type: 'timestamptz', nullable: true, default: null })
  activatedAt!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true, default: null })
  expiresAt!: Date | null;

  @Column({ type: 'text', nullable: true, default: null })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
