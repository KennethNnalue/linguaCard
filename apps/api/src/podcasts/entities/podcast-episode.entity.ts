import {
  Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn,
} from 'typeorm';
import type { CefrLevel, PodcastEpisodeStatus } from '@lingua-card/shared/domain';

export interface PodcastEpisodeGenerationInput {
  vocabulary: string[];
  direction?: string;
}

@Entity('podcast_episodes')
@Index('uq_podcast_episodes_topic_position', ['topicId', 'position'], { unique: true })
export class PodcastEpisodeEntity {
  @PrimaryColumn()
  id!: string;

  @Index('idx_podcast_episodes_topic')
  @Column()
  topicId!: string;

  @Index('uq_podcast_episodes_external_id', { unique: true })
  @Column({ type: 'varchar', length: 120 })
  externalId!: string;

  @Column({ type: 'varchar', length: 160 })
  title!: string;

  @Column({ type: 'varchar', length: 160, default: '' })
  titleTranslation!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column({ type: 'varchar', length: 4 })
  level!: CefrLevel;

  @Column()
  position!: number;

  @Column({ type: 'varchar', length: 30, default: 'draft' })
  status!: PodcastEpisodeStatus;

  @Column({ type: 'varchar', nullable: true })
  thumbnailAssetId!: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  audioUrl!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  audioStoragePath!: string | null;

  @Column({ default: 0 })
  audioDurationMs!: number;

  @Column({ default: 1 })
  contentVersion!: number;

  @Column({ default: 0 })
  audioVersion!: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  transcriptFingerprint!: string | null;

  @Column({ default: 0 })
  estimatedDurationMs!: number;

  @Column({ type: 'text', nullable: true })
  generationError!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  generationRequestId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  generationInput!: PodcastEpisodeGenerationInput | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  elevenLabsProjectId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;
}
