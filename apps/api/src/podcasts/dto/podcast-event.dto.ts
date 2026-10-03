import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { PodcastClientEventName, PodcastRecommendationPlacement } from '@lingua-card/shared/domain';
export class PodcastEventDto {
  @IsUUID() eventId!: string;
  @IsUUID() episodeId!: string;
  @IsIn(['recommendation_impression', 'recommendation_selected', 'playback_started', 'preview_opened', 'preparation_review_started', 'preparation_review_returned'])
  name!: PodcastClientEventName;
  @IsOptional() @IsIn(['home', 'review_summary', 'library']) placement?: PodcastRecommendationPlacement;
  @IsOptional() @IsUUID() recommendationId?: string;
  @IsOptional() @IsString() @MaxLength(40) policyVersion?: string;
}
