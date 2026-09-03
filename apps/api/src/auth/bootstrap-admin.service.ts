import {Injectable, Logger, OnApplicationBootstrap} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Raw, Repository} from 'typeorm';
import {UserEntity} from './user.entity';

const BOOTSTRAP_ADMIN_EMAIL = 'kennethnnalue.dev@gmail.com';

@Injectable()
export class BootstrapAdminService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapAdminService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const user = await this.users.findOneBy({
      email: Raw(alias => `LOWER(${alias}) = :email`, {email: BOOTSTRAP_ADMIN_EMAIL}),
    });
    if (!user || user.isAdmin) return;

    user.isAdmin = true;
    await this.users.save(user);
    this.logger.log('Promoted configured bootstrap administrator');
  }
}
