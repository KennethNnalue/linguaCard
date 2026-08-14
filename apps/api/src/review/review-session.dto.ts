import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import type { ReviewRating } from '@lingua-card/shared/domain';

export class UpsertReviewSessionDto {
  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  deckId?: string;

  @IsOptional()
  @IsString()
  collectionId?: string | null;

  @IsOptional()
  @IsString()
  collectionName?: string | null;

  @IsISO8601()
  startedAt!: string;

  @IsOptional()
  @IsISO8601()
  completedAt!: string | null;

  @IsInt()
  @Min(0)
  totalCards!: number;

  @IsInt()
  @Min(0)
  reviewedCards!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  newCards?: number;

  @IsObject()
  ratings!: Record<string, ReviewRating>;
}

export class UpsertReviewSessionBatchDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => UpsertReviewSessionDto)
  sessions!: UpsertReviewSessionDto[];
}
