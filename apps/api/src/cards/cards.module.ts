import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { CardEntity } from './card.entity';
import { WordDedupService } from './word-dedup.service';
import { WordAudioModule } from '../word-audio/word-audio.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { SharesModule } from '../shares/shares.module';
import { ReviewSchedulingEntity } from '../review/review-scheduling.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CardEntity, ReviewSchedulingEntity]),
    WordAudioModule,
    SubscriptionsModule,
    forwardRef(() => SharesModule),
  ],
  controllers: [CardsController],
  providers: [CardsService, WordDedupService],
  exports: [CardsService, WordDedupService],
})
export class CardsModule {}
