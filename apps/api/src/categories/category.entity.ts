import { Entity, PrimaryColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity('categories')
export class CategoryEntity {
  @PrimaryColumn()
  id!: string;

  @Index('idx_categories_userId')
  @Column()
  userId!: string;

  @Column()
  name!: string;

  @Column({ default: '#2D5A4E' })
  colour!: string;

  @Column({ default: 0 })
  cardCount!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
