import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString,
  Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';

class ImportCoverDto {
  @IsIn(['derived']) mode!: 'derived';
}

class ImportCollectionMetadataDto {
  @IsString() @MinLength(1) @MaxLength(120) externalId!: string;
  @IsString() @MinLength(1) @MaxLength(120) title!: string;
  @IsString() @MaxLength(1000) description!: string;
  @IsString() @Matches(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i) sourceLanguage!: string;
  @IsString() @Matches(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i) targetLanguage!: string;
  @IsIn(['A1', 'A2', 'B1', 'B2', 'C1']) level!: 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
  @IsString() @MinLength(1) @MaxLength(80) topic!: string;
  @ValidateNested() @Type(() => ImportCoverDto) cover!: ImportCoverDto;
}

class ImportGrammarDto {
  @IsOptional() @IsString() @MaxLength(20) article!: string | null;
  @IsOptional() @IsString() @MaxLength(30) gender!: string | null;
  @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(200, { each: true }) plurals!: string[];
}

class ImportLexemeDto {
  @IsString() @MinLength(1) @MaxLength(500) text!: string;
  @IsIn(['noun', 'verb', 'adjective', 'adverb', 'other'])
  partOfSpeech!: 'noun' | 'verb' | 'adjective' | 'adverb' | 'other';
  @ValidateNested() @Type(() => ImportGrammarDto) grammar!: ImportGrammarDto;
  @IsOptional() @IsString() @MaxLength(200) phonetic!: string | null;
  @IsOptional() @IsIn(['A1', 'A2', 'B1', 'B2', 'C1'])
  cefrLevel!: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | null;
}

class ImportLocalizationDto {
  @IsString() @Matches(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i) language!: string;
  @IsString() @MinLength(1) @MaxLength(500) translation!: string;
  @IsOptional() @IsString() @MaxLength(2000) definition!: string | null;
}

class ImportExampleDto {
  @IsString() @MinLength(1) @MaxLength(1000) targetText!: string;
  @IsString() @MinLength(1) @MaxLength(1000) sourceText!: string;
}

class ImportItemDto {
  @IsInt() @Min(1) @Max(500) position!: number;
  @ValidateNested() @Type(() => ImportLexemeDto) lexeme!: ImportLexemeDto;
  @ValidateNested() @Type(() => ImportLocalizationDto) localization!: ImportLocalizationDto;
  @IsArray() @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => ImportExampleDto)
  examples!: ImportExampleDto[];
}

export class PlatformCollectionImportPayloadDto {
  @IsInt() @IsIn([2]) schemaVersion!: 2;
  @IsOptional() @IsString() @MaxLength(255) fileName?: string;
  @ValidateNested() @Type(() => ImportCollectionMetadataDto) collection!: ImportCollectionMetadataDto;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500)
  @ValidateNested({ each: true }) @Type(() => ImportItemDto) items!: ImportItemDto[];
}

export class CreatePlatformCollectionImportDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) fingerprint!: string;
  @ValidateNested() @Type(() => PlatformCollectionImportPayloadDto)
  payload!: PlatformCollectionImportPayloadDto;
}
