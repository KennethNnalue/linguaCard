import { IsString, Matches, MaxLength } from 'class-validator';

export class UpdatePlatformStoryTitlesDto {
  @IsString() @Matches(/\S/u) @MaxLength(160)
  title!: string;

  @IsString() @Matches(/\S/u) @MaxLength(160)
  titleTranslation!: string;
}
