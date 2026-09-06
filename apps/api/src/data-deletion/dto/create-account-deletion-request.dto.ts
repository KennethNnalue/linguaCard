import { IsEmail, MaxLength } from 'class-validator';

export class CreateAccountDeletionRequestDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;
}
