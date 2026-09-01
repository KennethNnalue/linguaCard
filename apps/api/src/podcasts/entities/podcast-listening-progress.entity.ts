import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('podcast_listening_progress')
@Index('uq_podcast_progress_user_episode', ['userId', 'episodeId'], { unique: true })
export class PodcastListeningProgressEntity {
  @PrimaryColumn() id!: string;
  @Column() userId!: string;
  @Column() episodeId!: string;
  @Column() audioVersion!: number;
  @Column({ default: 0 }) positionMs!: number;
  @Column({ type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
