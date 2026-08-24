import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { CardView, CursorPage } from '@lingua-card/shared/domain';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ListLearningItemsQueryDto } from '../dto/list-learning-items-query.dto';
import { LearningItemReadService } from '../services/learning-item-read.service';

@Controller('v2/learning-items')
@UseGuards(JwtAuthGuard)
export class LearningItemsV2Controller {
  constructor(private readonly service: LearningItemReadService) {}

  @Get()
  findAll(
    @CurrentUser() userId: string,
    @Query() query: ListLearningItemsQueryDto,
  ): Promise<CursorPage<CardView>> {
    return this.service.listLearningItems({
      userId,
      learningContextId: query.learningContextId,
      collectionId: query.collectionId,
      query: query.query,
      cursor: query.cursor,
      limit: query.limit,
    });
  }
}
