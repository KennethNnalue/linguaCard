import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PlatformCollectionsService } from './platform-collections.service';
import type {
  PlatformCollectionListResponse,
  PlatformCollectionDetail,
  AdoptPlatformCollectionResult,
} from '@lingua-card/shared/domain';

@Controller('platform-collections')
@UseGuards(JwtAuthGuard)
export class PlatformCollectionsController {
  constructor(private readonly service: PlatformCollectionsService) {}

  @Get()
  findAll(@CurrentUser() userId: string): Promise<PlatformCollectionListResponse> {
    return this.service.findAll(userId);
  }

  @Get(':id')
  findOne(
    @CurrentUser() userId: string,
    @Param('id') id: string,
  ): Promise<PlatformCollectionDetail> {
    return this.service.findOne(userId, id);
  }

  @Post(':id/adopt')
  @HttpCode(200)
  adopt(
    @CurrentUser() userId: string,
    @Param('id') id: string,
  ): Promise<AdoptPlatformCollectionResult> {
    return this.service.adopt(userId, id);
  }
}
