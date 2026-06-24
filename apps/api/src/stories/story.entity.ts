import {
  Entity, PrimaryColumn, Column, Index,
  CreateDateColumn,
} from 'typeorm';
import type {
  StorySentence, WordTimestamp, StoryVocabWord,
  StoryDifficulty, StoryLength,
  StoryQuizQuestion, StoryGrammarNote, StoryKeyword,
  StoryGenerationStatus,
} from '@lingua-card/shared/domain';

@Entity('stories')
// A user can adopt a given platform story at most once. Partial index so the many
// user-generated rows (source_platform_story_id IS NULL) are not constrained.
@Index('uq_stories_user_source_platform', ['userId', 'sourcePlatformStoryId'], {
  unique: true,
  where: '"source_platform_story_id" IS NOT NULL',
})
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

  @Column({ type: 'text', nullable: true })
  bodyNative!: string;

  @Column({ type: 'varchar', length: 5, default: 'en' })
  nativeLang!: string;

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

  @Column({ nullable: true, type: 'varchar' })
  coverImageUrl!: string | null;

  @Column('jsonb', { default: [] })
  quizQuestions!: StoryQuizQuestion[];

  @Column('jsonb', { default: [] })
  grammarNotes!: StoryGrammarNote[];

  @Column('jsonb', { default: [] })
  keywords!: StoryKeyword[];

  @Column({ default: false })
  isLearned!: boolean;

  @Column({ name: 'model_used', type: 'varchar', nullable: true, default: null })
  modelUsed!: string | null;

  @Column({ name: 'generation_status', type: 'varchar', length: 20, default: 'complete' })
  generationStatus!: StoryGenerationStatus;

  /** Set when this story was adopted from a platform story; null = user-generated. */
  @Index('idx_stories_source_platform_story')
  @Column({ name: 'source_platform_story_id', type: 'varchar', nullable: true, default: null })
  sourcePlatformStoryId!: string | null;

  @CreateDateColumn()
  generatedAt!: Date;
}
