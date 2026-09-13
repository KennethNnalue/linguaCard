import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { UserEntity } from '../auth/user.entity';

@Entity('review_history_clearances')
export class ReviewHistoryClearanceEntity {
  @PrimaryColumn({ type: 'varchar' })
  userId!: string;

  @OneToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: UserEntity;

  @Column({ type: 'timestamptz' })
  clearedAt!: Date;
}
