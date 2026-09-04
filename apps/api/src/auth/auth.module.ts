import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserEntity } from './user.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { SettingsModule } from '../settings/settings.module';
import {BootstrapAdminService} from './bootstrap-admin.service';
import { UserAccountDeletionService } from './user-account-deletion.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'dev-secret-change-in-prod'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
    forwardRef(() => SubscriptionsModule),
    SettingsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, BootstrapAdminService, UserAccountDeletionService],
  exports: [AuthService, JwtModule, JwtAuthGuard],
})
export class AuthModule {}
