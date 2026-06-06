import {
  Entity, PrimaryGeneratedColumn, Column, Index, Unique,
} from 'typeorm';

@Entity('user_story_progress')
@Unique(['userId', 'storyId'])
export class UserStoryProgressEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_user_story_progress_userId')
  @Column()
  userId!: string;

  @Column()
  storyId!: string;

  @Column({ default: false })
  isRead!: boolean;

  @Column({ nullable: true, type: 'int' })
  quizScore!: number | null;

  @Column({ nullable: true, type: 'varchar' })
  lastReadAt!: string | null;

  @Column('text', { array: true, default: [] })
  savedWordIds!: string[];
}
