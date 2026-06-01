import {
  Entity, PrimaryColumn, Column, Index, Unique,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('word_audio')
@Unique('uq_word_audio_text_lang', ['normalizedText', 'language'])
export class WordAudioEntity {
  @PrimaryColumn()
  id!: string;

  @Index('idx_word_audio_normalized')
  @Column({ length: 500 })
  normalizedText!: string;

  @Column({ length: 500 })
  displayText!: string;

  @Column({ length: 10, default: 'de-DE' })
  language!: string;

  @Column({ nullable: true, type: 'varchar', length: 1000 })
  audioUrl!: string | null;

  @Column({ nullable: true, type: 'varchar', length: 500 })
  storagePath!: string | null;

  @Column({ default: 0 })
  durationMs!: number;

  @Index('idx_word_audio_status')
  @Column({ length: 20, default: 'pending' })
  status!: 'pending' | 'ready' | 'failed';

  // Set when status transitions to 'failed'. Used to enforce a cooldown before
  // retrying so a consistently-failing word doesn't hammer the TTS API on every tap.
  @Column({ nullable: true, type: 'timestamptz' })
  failedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
