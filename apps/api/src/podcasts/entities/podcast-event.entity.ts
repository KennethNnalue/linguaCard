import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';

import { UserEntity } from '../../auth/user.entity';
import { PodcastEpisodeEntity } from './podcast-episode.entity';

@Entity('podcast_events')
@Index('idx_podcast_events_user_time', ['userId', 'createdAt'])
export class PodcastEventEntity {
  @PrimaryColumn({ type: 'varchar' }) id!: string;
  @Column({ type: 'varchar' }) userId!: string;
  @Column({ type: 'varchar' }) episodeId!: string;
  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'userId' }) user?: UserEntity;
  @ManyToOne(() => PodcastEpisodeEntity, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'episodeId' }) episode?: PodcastEpisodeEntity;
  @Column({ type: 'varchar' }) name!: string;
  @Column({ type: 'jsonb', default: {} }) metadata!: object;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
