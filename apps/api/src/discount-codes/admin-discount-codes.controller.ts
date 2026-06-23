import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { DiscountCodesService } from './discount-codes.service';
import type {
  AdminDiscountCodeListItem,
  AdminGenerateDiscountCodeDto,
  AdminSetDiscountCodeActiveDto,
} from '@lingua-card/shared/domain';

@Controller('admin/discount-codes')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminDiscountCodesController {
  constructor(private readonly discountCodes: DiscountCodesService) {}

  @Get()
  list(): Promise<AdminDiscountCodeListItem[]> {
    return this.discountCodes.list();
  }

  @Post()
  @HttpCode(200)
  generate(@Body() dto: AdminGenerateDiscountCodeDto): Promise<AdminDiscountCodeListItem> {
    return this.discountCodes.generate(dto);
  }

  @Patch(':id')
  @HttpCode(204)
  async setActive(
    @Param('id') id: string,
    @Body() dto: AdminSetDiscountCodeActiveDto,
  ): Promise<void> {
    await this.discountCodes.setActive(id, dto.isActive);
  }
}
