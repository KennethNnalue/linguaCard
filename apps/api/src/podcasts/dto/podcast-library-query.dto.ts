import { IsIn, IsOptional } from 'class-validator';
import type { CefrLevel } from '@lingua-card/shared/domain';

export class PodcastLibraryQueryDto {
  @IsOptional()
  @IsIn(['A1', 'A2', 'B1', 'B2', 'C1'])
  level?: CefrLevel;
}
