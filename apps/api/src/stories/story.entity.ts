import {
  Entity, PrimaryColumn, Column, Index,
  CreateDateColumn,
} from 'typeorm';
import type {
  StorySentence, WordTimestamp, StoryVocabWord,
  StoryDifficulty, StoryLength,
} from '@lingua-card/shared/domain';

@Entity('stories')
export class StoryEntity {
  @PrimaryColumn()
  id!: string;

  @Index('idx_stories_userId')
  @Column()
  userId!: string;

  @Column()
  title!: string;

  @Column({ default: '' })
  titleTranslation!: string;

  @Column('text')
  bodyDe!: string;

  @Column('text')
  bodyEn!: string;

  @Column('jsonb', { default: [] })
  sentences!: StorySentence[];

  @Column('jsonb', { default: [] })
  wordTimestamps!: WordTimestamp[];

  @Column('jsonb', { default: [] })
  vocabWords!: StoryVocabWord[];

  @Column({ nullable: true, type: 'varchar' })
  audioUrl!: string | null;

  @Column({ default: 0 })
  audioDurationMs!: number;

  @Column('text', { array: true, default: [] })
  sourceCollectionIds!: string[];

  @Column()
  difficultyLevel!: StoryDifficulty;

  @Column()
  lengthType!: StoryLength;

  @Column({ default: 0 })
  listenCount!: number;

  @Column({ nullable: true, type: 'varchar' })
  lastListenedAt!: string | null;

  @CreateDateColumn()
  generatedAt!: Date;
}
