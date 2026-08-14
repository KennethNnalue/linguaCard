import { ArrayMaxSize, IsArray } from 'class-validator';

export class CommitReviewBatchDto {
  @IsArray()
  @ArrayMaxSize(500)
  commits!: unknown[];
}
