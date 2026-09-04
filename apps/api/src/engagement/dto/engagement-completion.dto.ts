import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsString, MaxLength, Min } from 'class-validator';

export class CompleteCollectionListeningDto {
  @IsArray()
  @ArrayMinSize(5)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  cardIds!: string[];
}

export class CompleteStoryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  @Min(0, { each: true })
  sentenceIndexes!: number[];
}
