import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { DiscountCodeEntity } from './discount-code.entity';

/** One row per (code, user) redemption — composite unique index enforces one-per-user. */
@Entity('discount_redemptions')
@Index(['codeId', 'userId'], { unique: true })
export class DiscountRedemptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'code_id' })
  codeId!: string;

  @ManyToOne(() => DiscountCodeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'code_id' })
  code!: DiscountCodeEntity;

  @Column({ name: 'user_id' })
  userId!: string;

  @CreateDateColumn({ name: 'redeemed_at' })
  redeemedAt!: Date;
}
