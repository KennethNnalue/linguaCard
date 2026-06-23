import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscountCodeEntity } from './discount-code.entity';
import { DiscountRedemptionEntity } from './discount-redemption.entity';
import { DiscountCodesService } from './discount-codes.service';
import { DiscountCodesController } from './discount-codes.controller';
import { AdminDiscountCodesController } from './admin-discount-codes.controller';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DiscountCodeEntity, DiscountRedemptionEntity]),
    SubscriptionsModule,
    forwardRef(() => AuthModule),
  ],
  providers: [DiscountCodesService],
  controllers: [DiscountCodesController, AdminDiscountCodesController],
})
export class DiscountCodesModule {}
