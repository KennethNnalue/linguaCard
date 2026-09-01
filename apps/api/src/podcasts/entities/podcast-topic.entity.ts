import {
  Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn,
} from 'typeorm';
import type { CefrLevel, LanguageCode, PodcastContentStatus } from '@lingua-card/shared/domain';

@Entity('podcast_topics')
export class PodcastTopicEntity {
  @PrimaryColumn()
  id!: string;

  @Index('uq_podcast_topics_external_id', { unique: true })
  @Column({ type: 'varchar', length: 120 })
  externalId!: string;

  @Column({ type: 'varchar', length: 160 })
  title!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column({ type: 'varchar', length: 10 })
  targetLanguage!: LanguageCode;

  @Column({ type: 'varchar', length: 10 })
  translationLanguage!: LanguageCode;

  @Column({ type: 'varchar', length: 4 })
  minimumLevel!: CefrLevel;

  @Column({ type: 'varchar', length: 4 })
  maximumLevel!: CefrLevel;

  @Index('idx_podcast_topics_status')
  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status!: PodcastContentStatus;

  @Column({ type: 'varchar', nullable: true })
  thumbnailAssetId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;
}
