import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { PodcastPlaybackRange } from '@lingua-card/shared/domain';

@Entity('podcast_listening_progress')
@Index('uq_podcast_progress_user_episode', ['userId', 'episodeId'], { unique: true })
export class PodcastListeningProgressEntity {
  @PrimaryColumn() id!: string;
  @Column() userId!: string;
  @Column() episodeId!: string;
  @Column() audioVersion!: number;
  @Column({ default: 0 }) positionMs!: number;
  @Column({ default: 0 }) qualifyingListenedMs!: number;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) listenedRanges!: PodcastPlaybackRange[];
  @Column({ type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
