import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { PodcastRecommendationPlacement } from '@lingua-card/shared/domain';
import { PodcastLibraryQueryDto } from './podcast-library-query.dto';

export class PodcastRecommendationsQueryDto extends PodcastLibraryQueryDto {
  @IsOptional() @IsIn(['home', 'review_summary', 'library'])
  placement?: PodcastRecommendationPlacement;
  @IsOptional() @IsUUID()
  sessionId?: string;
}
