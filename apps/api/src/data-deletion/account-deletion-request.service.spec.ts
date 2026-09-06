import { InsertQueryBuilder, Repository, SelectQueryBuilder } from 'typeorm';
import { UserEntity } from '../auth/user.entity';
import { ContactService } from '../contact/contact.service';
import { AccountDeletionRequestEntity } from './account-deletion-request.entity';
import { AccountDeletionRequestService } from './account-deletion-request.service';

describe('AccountDeletionRequestService', () => {
  it('records one pending request and notifies support for an existing account', async () => {
    const user = createUser();
    const userRepository = createUserRepository(user);
    const { repository, execute } = createRequestRepository([{ id: 'request-1' }]);
    const contactService = createContactService();
    const service = new AccountDeletionRequestService(repository, userRepository, contactService);

    await service.create(' PERSON@EXAMPLE.COM ');

    expect(execute).toHaveBeenCalledTimes(1);
    expect(contactService.sendAccountDeletionRequest).toHaveBeenCalledWith(user.email, user.id);
  });

  it('returns the same successful outcome without storing unknown email addresses', async () => {
    const userRepository = createUserRepository(null);
    const { repository, execute } = createRequestRepository([]);
    const contactService = createContactService();
    const service = new AccountDeletionRequestService(repository, userRepository, contactService);

    await expect(service.create('unknown@example.com')).resolves.toBeUndefined();

    expect(execute).not.toHaveBeenCalled();
    expect(contactService.sendAccountDeletionRequest).not.toHaveBeenCalled();
  });

  it('does not send repeated notifications when a pending request already exists', async () => {
    const userRepository = createUserRepository(createUser());
    const { repository } = createRequestRepository([]);
    const contactService = createContactService();
    const service = new AccountDeletionRequestService(repository, userRepository, contactService);

    await service.create('person@example.com');

    expect(contactService.sendAccountDeletionRequest).not.toHaveBeenCalled();
  });
});

function createUser(): UserEntity {
  return {
    id: 'user-1',
    email: 'person@example.com',
    name: 'Person',
    passwordHash: 'hash',
    avatarInitials: 'P',
    isAdmin: false,
    createdAt: new Date('2026-09-04T12:00:00.000Z'),
    updatedAt: new Date('2026-09-04T12:00:00.000Z'),
  };
}

function createUserRepository(user: UserEntity | null): Repository<UserEntity> {
  const builder = Object.create(SelectQueryBuilder.prototype) as SelectQueryBuilder<UserEntity>;
  jest.spyOn(builder, 'where').mockReturnValue(builder);
  jest.spyOn(builder, 'getOne').mockResolvedValue(user);
  const repository = Object.create(Repository.prototype) as Repository<UserEntity>;
  jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(builder);
  return repository;
}

function createRequestRepository(identifiers: Array<{ id: string }>): {
  repository: Repository<AccountDeletionRequestEntity>;
  execute: jest.Mock;
} {
  const selectBuilder = Object.create(SelectQueryBuilder.prototype) as SelectQueryBuilder<AccountDeletionRequestEntity>;
  const builder = Object.create(InsertQueryBuilder.prototype) as InsertQueryBuilder<AccountDeletionRequestEntity>;
  jest.spyOn(selectBuilder, 'insert').mockReturnValue(builder);
  jest.spyOn(builder, 'into').mockReturnValue(builder);
  jest.spyOn(builder, 'values').mockReturnValue(builder);
  jest.spyOn(builder, 'orIgnore').mockReturnValue(builder);
  const execute = jest.fn().mockResolvedValue({ identifiers, generatedMaps: [], raw: [] });
  builder.execute = execute;
  const repository = Object.create(Repository.prototype) as Repository<AccountDeletionRequestEntity>;
  jest.spyOn(repository, 'create').mockImplementation(value => ({
    id: value.id ?? 'request-1',
    userId: value.userId ?? '',
    email: value.email ?? '',
    status: value.status ?? 'pending',
    createdAt: new Date('2026-09-04T12:00:00.000Z'),
    updatedAt: new Date('2026-09-04T12:00:00.000Z'),
  }));
  jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(selectBuilder);
  return { repository, execute };
}

function createContactService(): ContactService {
  const service = Object.create(ContactService.prototype) as ContactService;
  service.sendAccountDeletionRequest = jest.fn().mockResolvedValue(undefined);
  return service;
}
