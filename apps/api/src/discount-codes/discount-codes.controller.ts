import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { DiscountCodesService } from './discount-codes.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RedeemDiscountCodeDto, RedeemDiscountResult } from '@lingua-card/shared/domain';

@Controller('discount-codes')
export class DiscountCodesController {
  constructor(private readonly discountCodes: DiscountCodesService) {}

  @Post('redeem')
  @HttpCode(200)
  redeem(
    @CurrentUser() userId: string,
    @Body() dto: RedeemDiscountCodeDto,
  ): Promise<RedeemDiscountResult> {
    return this.discountCodes.redeem(userId, dto.code);
  }
}
