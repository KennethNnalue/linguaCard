import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageService } from '../storage/storage.service';
import { ObjectDeletionJobEntity } from './object-deletion-job.entity';
import { ObjectDeletionProcessorService } from './object-deletion-processor.service';
import { ObjectDeletionQueueService } from './object-deletion-queue.service';
import { AccountDeletionRequestEntity } from './account-deletion-request.entity';
import { AccountDeletionRequestController } from './account-deletion-request.controller';
import { AccountDeletionRequestService } from './account-deletion-request.service';
import { UserEntity } from '../auth/user.entity';
import { ContactModule } from '../contact/contact.module';

@Module({
  imports: [TypeOrmModule.forFeature([ObjectDeletionJobEntity, AccountDeletionRequestEntity, UserEntity]), ContactModule],
  controllers: [AccountDeletionRequestController],
  providers: [StorageService, ObjectDeletionQueueService, ObjectDeletionProcessorService, AccountDeletionRequestService],
  exports: [ObjectDeletionQueueService],
})
export class DataDeletionModule {}
