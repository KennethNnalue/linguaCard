import { IsIn, IsOptional } from 'class-validator';
import type { PodcastLibraryLevel } from '@lingua-card/shared/domain';

export class PodcastLibraryQueryDto {
  @IsOptional()
  @IsIn(['all', 'A1', 'A2', 'B1', 'B2'])
  level?: PodcastLibraryLevel;
}
