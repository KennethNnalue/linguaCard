import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('user_collection_items')
@Index('idx_user_collection_items_learning_item', ['learningItemId'])
export class CollectionMembershipEntity {
  @PrimaryColumn({ type: 'varchar' })
  collectionId!: string;

  @PrimaryColumn({ type: 'varchar' })
  learningItemId!: string;

  @Column({ type: 'integer', default: 0 })
  position!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
