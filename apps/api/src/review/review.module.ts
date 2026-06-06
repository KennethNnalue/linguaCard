import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReviewSessionEntity } from './review-session.entity';
import { ReviewSessionsService } from './review-sessions.service';
import { ReviewSessionsController } from './review-sessions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ReviewSessionEntity])],
  controllers: [ReviewSessionsController],
  providers: [ReviewSessionsService],
  exports: [ReviewSessionsService],
})
export class ReviewModule {}
