import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSettingsEntity } from './user-settings.entity';
import { UserSettingsService } from './user-settings.service';
import { UserSettingsController } from './user-settings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserSettingsEntity])],
  providers: [UserSettingsService],
  controllers: [UserSettingsController],
  exports: [UserSettingsService],
})
export class SettingsModule {}
