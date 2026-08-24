import { IsString, MinLength } from 'class-validator';

export class VaultQueryDto {
  @IsString()
  @MinLength(1)
  learningContextId!: string;
}
