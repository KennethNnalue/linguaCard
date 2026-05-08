import { IsString, IsOptional, IsArray, IsBoolean, IsNumber, IsIn, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { ArticleType, LanguageCode } from '@lingua-card/shared/domain';

// ─── CARD DTOs ────────────────────────────────────────────────────────────────

export class CreateExampleSentenceDto {
  @IsString() target!: string;
  @IsString() native!: string;
}

export class CreateCardContentDto {
  @IsString() @MinLength(1) front!: string;
  @IsString() @MinLength(1) back!: string;

  @IsOptional()
  @IsIn(['der', 'die', 'das', 'le', 'la', 'el', 'un', 'une', null])
  article?: ArticleType;

  @IsOptional()
  @IsIn(['masculine', 'feminine', 'neuter', null])
  gender?: string | null;

  @IsOptional() @IsArray() examples?: CreateExampleSentenceDto[];
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() audioAssetId?: string | null;
  @IsOptional() @IsString() imageUrl?: string | null;
  @IsOptional() @IsString() phonetic?: string | null;
}

export class CreateCardDto {
  @IsString() deckId!: string;
  @IsOptional() @IsString() collectionId?: string | null;
  @IsString() userId!: string;
  @IsString() contextId!: string;
  @ValidateNested() @Type(() => CreateCardContentDto) content!: CreateCardContentDto;
  @IsOptional() @IsArray() categoryIds?: string[];
  @IsOptional() @IsArray() tags?: string[];
}

export class UpdateCardDto {
  @IsOptional() content?: Partial<CreateCardContentDto>;
  @IsOptional() @IsArray() categoryIds?: string[];
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsString() collectionId?: string | null;
}

export class RateCardDto {
  @IsNumber() @IsIn([0, 1, 2, 3, 4, 5]) rating!: number;
}

// ─── COLLECTION DTOs ──────────────────────────────────────────────────────────

export class CreateCollectionDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsOptional() @IsString() emoji?: string;
  @IsOptional() @IsString() colour?: string;
  @IsString() contextId!: string;
  @IsOptional() @IsString() description?: string;
}

export class UpdateCollectionDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @IsOptional() @IsString() emoji?: string;
  @IsOptional() @IsString() colour?: string;
  @IsOptional() @IsString() description?: string;
}

// ─── CATEGORY DTOs ────────────────────────────────────────────────────────────

export class CreateCategoryDto {
  @IsString() @MinLength(1) @MaxLength(60) name!: string;
  @IsOptional() @IsString() colour?: string;
  @IsString() userId!: string;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) name?: string;
  @IsOptional() @IsString() colour?: string;
}

// ─── AUTH DTOs ────────────────────────────────────────────────────────────────

export class RegisterDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsString() email!: string;
  @IsString() @MinLength(8) password!: string;
}

export class LoginDto {
  @IsString() email!: string;
  @IsString() password!: string;
}

// ─── SRS DTOs ────────────────────────────────────────────────────────────────

export class ReviewSessionCreateDto {
  @IsString() deckId!: string;
  @IsOptional() @IsString() collectionId?: string;
  @IsOptional() @IsNumber() limit?: number;
}

// ─── QUERY PARAMS ─────────────────────────────────────────────────────────────

export interface CardQueryParams {
  collectionId?: string;
  categoryId?: string;
  contextId?: string;
  state?: string;
  dueBefore?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface CollectionQueryParams {
  contextId?: string;
  page?: number;
  limit?: number;
}

export interface CategoryQueryParams {
  userId?: string;
}

// ─── PLAIN INTERFACES (for Angular use without class-validator) ───────────────

export interface ICreateCollectionDto {
  name: string;
  emoji?: string;
  colour?: string;
  contextId: string;
  description?: string;
}

export interface IUpdateCollectionDto {
  name?: string;
  emoji?: string;
  colour?: string;
  description?: string;
}

export interface ICreateCategoryDto {
  name: string;
  colour?: string;
  userId: string;
}

export interface IUpdateCategoryDto {
  name?: string;
  colour?: string;
}
