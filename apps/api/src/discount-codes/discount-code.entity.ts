import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, Index,
} from 'typeorm';

@Entity('discount_codes')
export class DiscountCodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Normalized UPPERCASE code text — unique. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ name: 'percent_off', type: 'int' })
  percentOff!: number;

  /** Days of Pro granted on redemption; null = lifetime. */
  @Column({ name: 'duration_days', type: 'int', nullable: true, default: null })
  durationDays!: number | null;

  /** Total redemptions allowed; null = unlimited. */
  @Column({ name: 'max_redemptions', type: 'int', nullable: true, default: null })
  maxRedemptions!: number | null;

  @Column({ name: 'redeemed_count', type: 'int', default: 0 })
  redeemedCount!: number;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true, default: null })
  expiresAt!: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  /** Admin-facing note (e.g. campaign name). */
  @Column({ type: 'text', nullable: true, default: null })
  label!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
