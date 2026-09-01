import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { PodcastVoiceGender } from '@lingua-card/shared/domain';

@Entity('podcast_speakers')
@Index('uq_podcast_speakers_episode_key', ['episodeId', 'speakerKey'], { unique: true })
export class PodcastSpeakerEntity {
  @PrimaryColumn() id!: string;
  @Column() episodeId!: string;
  @Column({ type: 'varchar', length: 60 }) speakerKey!: string;
  @Column({ type: 'varchar', length: 100 }) displayName!: string;
  @Column({ type: 'varchar', length: 10 }) voiceGender!: PodcastVoiceGender;
  @Column({ type: 'varchar', length: 200 }) voiceId!: string;
  @Column() position!: number;
}
