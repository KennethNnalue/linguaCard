import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { CardEntity } from './card.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CardEntity])],
  controllers: [CardsController],
  providers: [CardsService],
})
export class CardsModule {}
