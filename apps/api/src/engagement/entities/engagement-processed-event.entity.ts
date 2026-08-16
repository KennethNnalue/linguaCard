import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('engagement_processed_events')
export class EngagementProcessedEventEntity {
  @PrimaryColumn({ type: 'varchar' }) userId!: string;
  @PrimaryColumn({ type: 'varchar' }) eventId!: string;
  @Column({ type: 'date' }) dayKey!: string;
  @CreateDateColumn() processedAt!: Date;
}
