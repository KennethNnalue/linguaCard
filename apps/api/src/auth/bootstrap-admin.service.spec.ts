import type {Repository} from 'typeorm';
import {BootstrapAdminService} from './bootstrap-admin.service';
import {UserEntity} from './user.entity';

describe('BootstrapAdminService', () => {
  it('promotes an existing matching user', async () => {
    const user = {email: 'kennethnnalue.dev@gmail.com', isAdmin: false} as UserEntity;
    const users = {
      findOneBy: jest.fn().mockResolvedValue(user),
      save: jest.fn().mockImplementation(value => Promise.resolve(value)),
    } as unknown as Repository<UserEntity>;

    await new BootstrapAdminService(users).onApplicationBootstrap();

    expect(user.isAdmin).toBe(true);
    expect(users.save).toHaveBeenCalledWith(user);
  });

  it('does nothing when the user does not exist yet', async () => {
    const users = {
      findOneBy: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    } as unknown as Repository<UserEntity>;

    await new BootstrapAdminService(users).onApplicationBootstrap();

    expect(users.save).not.toHaveBeenCalled();
  });

  it('does not rewrite an administrator on every startup', async () => {
    const user = {email: 'kennethnnalue.dev@gmail.com', isAdmin: true} as UserEntity;
    const users = {
      findOneBy: jest.fn().mockResolvedValue(user),
      save: jest.fn(),
    } as unknown as Repository<UserEntity>;

    await new BootstrapAdminService(users).onApplicationBootstrap();

    expect(users.save).not.toHaveBeenCalled();
  });
});
