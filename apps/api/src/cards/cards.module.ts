import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { CardEntity } from './card.entity';
import { WordDedupService } from './word-dedup.service';
import { WordAudioModule } from '../word-audio/word-audio.module';

@Module({
  imports: [TypeOrmModule.forFeature([CardEntity]), WordAudioModule],
  controllers: [CardsController],
  providers: [CardsService, WordDedupService],
  exports: [CardsService],
})
export class CardsModule {}
