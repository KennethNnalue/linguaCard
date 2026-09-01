import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { PodcastVocabularyImportance } from '@lingua-card/shared/domain';

@Entity('podcast_episode_vocabulary')
@Index('uq_podcast_episode_vocabulary_key', ['episodeId', 'vocabularyKey'], { unique: true })
@Index('uq_podcast_episode_vocabulary_lexeme', ['episodeId', 'lexemeId'], { unique: true })
export class PodcastEpisodeVocabularyEntity {
  @PrimaryColumn() id!: string;
  @Column() episodeId!: string;
  @Column() lexemeId!: string;
  @Column({ type: 'varchar', length: 60 }) vocabularyKey!: string;
  @Column() position!: number;
  @Column({ type: 'varchar', length: 20 }) importance!: PodcastVocabularyImportance;
}
