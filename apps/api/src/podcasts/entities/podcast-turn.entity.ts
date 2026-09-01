import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { PodcastWordTiming } from '@lingua-card/shared/domain';

@Entity('podcast_turns')
@Index('uq_podcast_turns_episode_position', ['episodeId', 'position'], { unique: true })
export class PodcastTurnEntity {
  @PrimaryColumn() id!: string;
  @Column() episodeId!: string;
  @Column() speakerId!: string;
  @Column() position!: number;
  @Column({ type: 'text' }) targetText!: string;
  @Column({ type: 'text' }) translation!: string;
  @Column({ type: 'jsonb', default: [] }) vocabularyKeys!: string[];
  @Column({ type: 'integer', nullable: true }) startMs!: number | null;
  @Column({ type: 'integer', nullable: true }) endMs!: number | null;
  @Column({ type: 'jsonb', default: [] }) wordTimings!: PodcastWordTiming[];
}
