import { Body, Controller, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CardAdministrationCommandDto } from './card-administration.dto';
import { CardAdministrationService } from './card-administration.service';

@Controller('cards/:cardId/administration')
export class CardAdministrationController {
  constructor(private readonly administration: CardAdministrationService) {}

  @Post()
  execute(
    @CurrentUser() userId: string,
    @Param('cardId') cardId: string,
    @Body() command: CardAdministrationCommandDto,
  ) {
    return this.administration.execute(userId, cardId, command);
  }
}
