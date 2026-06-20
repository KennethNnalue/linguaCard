import {
  Entity, PrimaryColumn, Column, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { UserEntity } from '../auth/user.entity';

@Entity('user_settings')
export class UserSettingsEntity {
  @PrimaryColumn({ name: 'user_id' })
  @Index({ unique: true })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ name: 'daily_goal', type: 'int', default: 20 })
  dailyGoal!: number;

  @Column({ name: 'weekly_goal', type: 'int', default: 120 })
  weeklyGoal!: number;

  @Column({ name: 'monthly_goal', type: 'int', default: 500 })
  monthlyGoal!: number;

  @Column({ name: 'reminders_enabled', type: 'boolean', default: false })
  remindersEnabled!: boolean;

  @Column({ name: 'reminder_time', type: 'varchar', length: 5, default: '19:00' })
  reminderTime!: string;

  @Column({ name: 'timezone', type: 'varchar', length: 64, default: 'UTC' })
  timezone!: string;

  @Column({ name: 'ui_language', type: 'varchar', length: 10, default: 'en' })
  uiLanguage!: string;

  @Column({ name: 'goals_set_at', type: 'timestamptz', nullable: true, default: null })
  goalsSetAt!: Date | null;

  /**
   * Per-field last-modified timestamps (field name → ISO string), used for
   * last-write-wins reconciliation. A PATCH only overwrites a field when its
   * client edit time is newer than the timestamp recorded here.
   */
  @Column({ name: 'field_timestamps', type: 'jsonb', default: () => "'{}'" })
  fieldTimestamps!: Record<string, string>;

  @Column({ name: 'last_reminded_on', type: 'varchar', length: 10, nullable: true, default: null })
  lastRemindedOn!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
