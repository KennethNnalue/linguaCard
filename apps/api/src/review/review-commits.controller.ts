import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CommitReviewBatchDto } from './review-commit.dto';
import { ReviewCommitsService } from './review-commits.service';

@Controller('review/commits')
export class ReviewCommitsController {
  constructor(private readonly commits: ReviewCommitsService) {}

  @Post('batch')
  commitBatch(@CurrentUser() userId: string, @Body() dto: CommitReviewBatchDto) {
    return this.commits.commitBatch(userId, dto.commits);
  }
}
