import {
  Entity, PrimaryColumn, Column, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('collections')
export class CollectionEntity {
  @PrimaryColumn()
  id!: string;

  @Index('idx_collections_userId')
  @Column()
  userId!: string;

  @Column()
  name!: string;

  @Column({ default: '' })
  description!: string;

  @Column({ default: '📚' })
  emoji!: string;

  @Column({ default: '#2D5A4E' })
  colour!: string;

  @Column()
  contextId!: string;

  @Column({ default: 0 })
  cardCount!: number;

  @Column({ default: 0 })
  masteredCount!: number;

  @Column({ default: 0 })
  dueCount!: number;

  @Column({ default: false })
  isDefault!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
