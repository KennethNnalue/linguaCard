import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { AccountDeletionRequestService } from './account-deletion-request.service';
import { CreateAccountDeletionRequestDto } from './dto/create-account-deletion-request.dto';

@Controller('account-deletion-requests')
export class AccountDeletionRequestController {
  constructor(private readonly requests: AccountDeletionRequestService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async create(@Body() dto: CreateAccountDeletionRequestDto): Promise<{ accepted: true }> {
    await this.requests.create(dto.email);
    return { accepted: true };
  }
}
