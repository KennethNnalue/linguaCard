import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReviewSessionEntity } from './review-session.entity';
import { ReviewSessionsService } from './review-sessions.service';
import { ReviewSessionsController } from './review-sessions.controller';
import { ReviewCommitEntity } from './review-commit.entity';
import { ReviewCommitsController } from './review-commits.controller';
import { ReviewCommitsService } from './review-commits.service';
import { CardEntity } from '../cards/card.entity';
import { ReviewSchedulingEntity } from './review-scheduling.entity';
import { CardAdministrationEventEntity } from './card-administration.entity';
import { CardAdministrationController } from './card-administration.controller';
import { CardAdministrationService } from './card-administration.service';

@Module({
  imports: [TypeOrmModule.forFeature([ReviewSessionEntity, ReviewCommitEntity, CardAdministrationEventEntity, CardEntity, ReviewSchedulingEntity])],
  controllers: [ReviewSessionsController, ReviewCommitsController, CardAdministrationController],
  providers: [ReviewSessionsService, ReviewCommitsService, CardAdministrationService],
  exports: [ReviewSessionsService],
})
export class ReviewModule {}
