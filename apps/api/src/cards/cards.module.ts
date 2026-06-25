import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { CardEntity } from './card.entity';
import { WordDedupService } from './word-dedup.service';
import { WordAudioModule } from '../word-audio/word-audio.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [TypeOrmModule.forFeature([CardEntity]), WordAudioModule, SubscriptionsModule],
  controllers: [CardsController],
  providers: [CardsService, WordDedupService],
  exports: [CardsService, WordDedupService],
})
export class CardsModule {}
