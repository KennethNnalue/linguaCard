import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { UserEntity } from '../auth/user.entity';

@Entity('push_subscriptions')
export class PushSubscriptionEntity {
  @PrimaryColumn({ type: 'text' })
  endpoint!: string;

  @Index()
  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ type: 'varchar', length: 255 })
  p256dh!: string;

  @Column({ type: 'varchar', length: 255 })
  auth!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
