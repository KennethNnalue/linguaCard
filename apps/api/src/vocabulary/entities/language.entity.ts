import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { SpeechPolicy, TextDirection } from '../models/vocabulary.types';

@Entity('languages')
export class LanguageEntity {
  @PrimaryColumn({ type: 'varchar', length: 10 })
  code!: string;

  @Column({ type: 'varchar', length: 80 })
  displayName!: string;

  @Column({ type: 'varchar', length: 20 })
  defaultLocale!: string;

  @Column({ type: 'varchar', length: 3, default: 'ltr' })
  textDirection!: TextDirection;

  @Column({ default: false })
  isSourceEnabled!: boolean;

  @Column({ default: false })
  isTargetEnabled!: boolean;

  @Column({ type: 'varchar', length: 20, default: 'synthesized' })
  targetSpeechPolicy!: SpeechPolicy;

  @Column({ type: 'varchar', length: 20, default: 'device' })
  sourceSpeechPolicy!: SpeechPolicy;
}
