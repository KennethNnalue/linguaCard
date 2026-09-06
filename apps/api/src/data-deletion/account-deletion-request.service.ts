import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { UserEntity } from '../auth/user.entity';
import { ContactService } from '../contact/contact.service';
import { AccountDeletionRequestEntity } from './account-deletion-request.entity';

@Injectable()
export class AccountDeletionRequestService {
  constructor(
    @InjectRepository(AccountDeletionRequestEntity)
    private readonly requestRepository: Repository<AccountDeletionRequestEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly contactService: ContactService,
  ) {}

  async create(emailInput: string): Promise<void> {
    const email = emailInput.trim().toLowerCase();
    const user = await this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.email) = :email', { email })
      .getOne();
    if (!user) return;

    const request = this.requestRepository.create({
        id: randomUUID(),
        userId: user.id,
        email: user.email,
        status: 'pending',
    });
    const insertion = await this.requestRepository.createQueryBuilder()
      .insert()
      .into(AccountDeletionRequestEntity)
      .values(request)
      .orIgnore()
      .execute();
    if (insertion.identifiers.length === 0) return;

    await this.contactService.sendAccountDeletionRequest(user.email, user.id);
  }
}
