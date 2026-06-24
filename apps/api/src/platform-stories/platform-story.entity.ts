import {
  Entity, PrimaryColumn, Column, Index, CreateDateColumn,
} from 'typeorm';
import type {
  StorySentence, WordTimestamp, StoryKeyword,
  StoryQuizQuestion, StoryGrammarNote,
  StoryDifficulty, StoryCategory, StoryLength,
} from '@lingua-card/shared/domain';

@Entity('platform_stories')
export class PlatformStoryEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  title!: string;

  @Column({ default: '' })
  titleTranslation!: string;

  @Column('text')
  bodyDe!: string;

  @Column({ type: 'text', nullable: true })
  bodyNative!: string;

  @Column({ type: 'varchar', length: 5, default: 'en' })
  nativeLang!: string;

  @Column('jsonb', { default: [] })
  sentences!: StorySentence[];

  @Column('jsonb', { default: [] })
  wordTimestamps!: WordTimestamp[];

  @Column('jsonb', { default: [] })
  keywords!: StoryKeyword[];

  @Column('jsonb', { default: [] })
  quizQuestions!: StoryQuizQuestion[];

  @Column('jsonb', { default: [] })
  grammarNotes!: StoryGrammarNote[];

  @Column({ nullable: true, type: 'varchar' })
  audioUrl!: string | null;

  @Column({ default: 0 })
  audioDurationMs!: number;

  @Column({ nullable: true, type: 'varchar' })
  coverImageUrl!: string | null;

  @Index('idx_platform_stories_level')
  @Column()
  level!: StoryDifficulty;

  @Index('idx_platform_stories_category')
  @Column()
  category!: StoryCategory;

  @Column('text', { array: true, default: [] })
  topics!: string[];

  @Column({ default: false })
  isFiction!: boolean;

  @Column({ default: false })
  isPremium!: boolean;

  @Column({ default: 0 })
  wordCount!: number;

  @Column({ type: 'varchar', length: 20, default: 'short' })
  lengthType!: StoryLength;

  @Column({ default: 0 })
  estimatedReadMinutes!: number;

  @Column({ default: 0 })
  readCount!: number;

  @Column({ default: true })
  isPublished!: boolean;

  @Index('idx_platform_stories_collection')
  @Column({ nullable: true, type: 'varchar' })
  platformCollectionId!: string | null;

  @CreateDateColumn()
  publishedAt!: Date;
}
