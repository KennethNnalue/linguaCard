import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { UserEntity } from '../../auth/user.entity';
@Entity('podcast_recommendation_assignments')
export class PodcastRecommendationAssignmentEntity {
  @PrimaryColumn({ type: 'varchar' }) id!: string;
  @Column({ type: 'varchar' }) userId!: string;
  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'userId' }) user?: UserEntity;
  @Column({ type: 'varchar' }) experimentVersion!: string;
  @Column({ type: 'varchar' }) cohort!: 'treatment' | 'control';
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
