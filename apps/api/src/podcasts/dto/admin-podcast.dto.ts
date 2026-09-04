import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional,
  IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import type { CefrLevel, LanguageCode } from '@lingua-card/shared/domain';

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
const LANGUAGE_CODES = ['en', 'de', 'fr', 'es', 'it', 'pt', 'ja', 'zh', 'ko', 'ar', 'uk', 'tr', 'ru'] as const;
const CONTAINS_NON_WHITESPACE = /\S/u;

export class CreatePodcastTopicDto {
  @IsString()
  @MinLength(1)
  @Matches(CONTAINS_NON_WHITESPACE)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MaxLength(2000)
  description!: string;

  @IsIn(LANGUAGE_CODES)
  @MaxLength(10)
  targetLanguage!: LanguageCode;

  @IsIn(LANGUAGE_CODES)
  @MaxLength(10)
  translationLanguage!: LanguageCode;

  @IsIn(CEFR_LEVELS)
  level!: CefrLevel;
}

export class UpdatePodcastTopicDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @Matches(CONTAINS_NON_WHITESPACE)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(CEFR_LEVELS)
  level?: CefrLevel;
}

export class CreatePodcastEpisodeDto {
  @IsUUID()
  requestId!: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(40)
  @IsString({ each: true }) @MinLength(1, { each: true })
  @Matches(CONTAINS_NON_WHITESPACE, { each: true }) @MaxLength(200, { each: true })
  vocabulary!: string[];

  @IsOptional() @IsString() @Matches(CONTAINS_NON_WHITESPACE) @MaxLength(500)
  direction?: string;
}

export class CreatePodcastEpisodeDraftDto {
  @IsUUID()
  requestId!: string;
}

export class GeneratePodcastTranscriptDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @IsString({ each: true }) @MinLength(1, { each: true })
  @Matches(CONTAINS_NON_WHITESPACE, { each: true }) @MaxLength(200, { each: true })
  vocabulary!: string[];

  @IsOptional() @IsString() @Matches(CONTAINS_NON_WHITESPACE) @MaxLength(500)
  direction?: string;
}

export class CreateElevenLabsPodcastDto extends GeneratePodcastTranscriptDto {}

export class PodcastThumbnailMetadataDto {
  @IsString()
  @MinLength(1)
  @Matches(CONTAINS_NON_WHITESPACE)
  @MaxLength(300)
  accessibilityDescription!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  focalPointX!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  focalPointY!: number;
}

export class PodcastTranscriptSpeakerDto {
  @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(60) key!: string;
  @IsString() @MinLength(1) @Matches(CONTAINS_NON_WHITESPACE) @MaxLength(100) name!: string;
  @IsIn(['female', 'male']) voiceGender!: 'female' | 'male';
  @IsOptional() @IsString() @MinLength(1) @Matches(CONTAINS_NON_WHITESPACE) @MaxLength(200) voiceId?: string;
}

export class PodcastTranscriptTurnDto {
  @IsString() @MaxLength(60) speakerKey!: string;
  @IsString() @MinLength(1) @Matches(CONTAINS_NON_WHITESPACE) @MaxLength(1000) targetText!: string;
  @IsString() @MinLength(1) @Matches(CONTAINS_NON_WHITESPACE) @MaxLength(1000) translation!: string;
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) vocabularyRefs!: string[];
}

export class PodcastTranscriptVocabularyDto {
  @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(60) key!: string;
  @IsString() @MinLength(1) @Matches(CONTAINS_NON_WHITESPACE) @MaxLength(500) text!: string;
  @IsString() @MinLength(1) @Matches(CONTAINS_NON_WHITESPACE) @MaxLength(500) translation!: string;
  @IsIn(['essential', 'supporting']) importance!: 'essential' | 'supporting';
}

export class PodcastTranscriptEpisodeDto {
  @IsString() @MinLength(1) @Matches(CONTAINS_NON_WHITESPACE) @MaxLength(160) title!: string;
  @IsString() @MinLength(1) @Matches(CONTAINS_NON_WHITESPACE) @MaxLength(160) titleTranslation!: string;
  @IsString() @MinLength(1) @Matches(CONTAINS_NON_WHITESPACE) @MaxLength(2000) description!: string;
}

export class PodcastTranscriptPayloadDto {
  @IsInt() @IsIn([1]) schemaVersion!: 1;
  @IsOptional() @ValidateNested() @Type(() => PodcastTranscriptEpisodeDto)
  episode?: PodcastTranscriptEpisodeDto;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6)
  @ValidateNested({ each: true }) @Type(() => PodcastTranscriptSpeakerDto)
  speakers!: PodcastTranscriptSpeakerDto[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => PodcastTranscriptTurnDto)
  turns!: PodcastTranscriptTurnDto[];
  @IsArray() @ArrayMaxSize(40)
  @ValidateNested({ each: true }) @Type(() => PodcastTranscriptVocabularyDto)
  vocabulary!: PodcastTranscriptVocabularyDto[];
}

export class CommitPodcastTranscriptDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) fingerprint!: string;
  @ValidateNested() @Type(() => PodcastTranscriptPayloadDto) payload!: PodcastTranscriptPayloadDto;
}

export class PodcastPlaybackRangeDto {
  @IsInt() @Min(0) @Max(300000) startMs!: number;
  @IsInt() @Min(1) @Max(300000) endMs!: number;
}

export class SavePodcastProgressDto {
  @IsInt() @Min(1) audioVersion!: number;
  @IsInt() @Min(0) @Max(300000) positionMs!: number;
  @IsIn([true, false]) completed!: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PodcastPlaybackRangeDto)
  playedRanges?: PodcastPlaybackRangeDto[];
}
