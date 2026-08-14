import { Equals, IsIn, IsOptional, IsUUID } from 'class-validator';
import { CardAdministrationType } from '@lingua-card/shared/domain';
import type { CardAdministrationType as CardAdministrationTypeValue } from '@lingua-card/shared/domain';

export class CardAdministrationCommandDto {
  @IsUUID()
  commandId!: string;

  @IsIn(Object.values(CardAdministrationType))
  type!: CardAdministrationTypeValue;

  @IsOptional()
  @Equals(true)
  confirmHistoryRetention?: true;
}
