import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { LearningContextView, VaultView } from '@lingua-card/shared/domain';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { VaultQueryDto } from '../dto/vault-query.dto';
import { LearningItemReadService } from '../services/learning-item-read.service';

@Controller('v2/vault')
@UseGuards(JwtAuthGuard)
export class VaultV2Controller {
  constructor(private readonly service: LearningItemReadService) {}

  @Get()
  loadVault(
    @CurrentUser() userId: string,
    @Query() query: VaultQueryDto,
  ): Promise<VaultView> {
    return this.service.loadVault(userId, query.learningContextId);
  }

  @Get('active-context')
  loadActiveContext(@CurrentUser() userId: string): Promise<LearningContextView> {
    return this.service.loadActiveLearningContext(userId);
  }
}
