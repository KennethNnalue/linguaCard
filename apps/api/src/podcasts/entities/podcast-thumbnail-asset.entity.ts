import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('podcast_thumbnail_assets')
export class PodcastThumbnailAssetEntity {
  @PrimaryColumn()
  id!: string;

  @Column({ type: 'varchar', length: 1000 })
  originalUrl!: string;

  @Column({ type: 'varchar', length: 500 })
  originalStoragePath!: string;

  @Column({ type: 'varchar', length: 50 })
  originalMimeType!: string;

  @Column()
  originalWidth!: number;

  @Column()
  originalHeight!: number;

  @Column({ type: 'varchar', length: 1000 })
  cardUrl!: string;

  @Column({ type: 'varchar', length: 500 })
  cardStoragePath!: string;

  @Column()
  cardWidth!: number;

  @Column()
  cardHeight!: number;

  @Column({ type: 'varchar', length: 1000 })
  heroUrl!: string;

  @Column({ type: 'varchar', length: 500 })
  heroStoragePath!: string;

  @Column()
  heroWidth!: number;

  @Column()
  heroHeight!: number;

  @Column({ type: 'varchar', length: 300 })
  accessibilityDescription!: string;

  @Column({ type: 'double precision', default: 0.5 })
  focalPointX!: number;

  @Column({ type: 'double precision', default: 0.5 })
  focalPointY!: number;

  @Column({ type: 'varchar', length: 64 })
  contentHash!: string;

  @Column({ default: 1 })
  version!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
