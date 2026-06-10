import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { UserEntity } from './user.entity';
import { SubscriptionService } from '../subscriptions/subscription.service';
import { UserSettingsService } from '../settings/user-settings.service';
import type { LoginDto, RegisterDto } from '@lingua-card/shared/dto';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarInitials: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly jwtService: JwtService,
    private readonly subscriptions: SubscriptionService,
    private readonly settings: UserSettingsService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.userRepo.findOneBy({ email: dto.email });
    if (existing) throw new ConflictException('Email already registered');

    const parts = dto.name.trim().split(' ');
    const avatarInitials =
      parts.length >= 2
        ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
        : parts[0].slice(0, 2).toUpperCase();

    const entity = this.userRepo.create({
      id: randomUUID(),
      email: dto.email,
      name: dto.name,
      passwordHash: await bcrypt.hash(dto.password, 12),
      avatarInitials,
    });
    const saved = await this.userRepo.save(entity);
    await this.subscriptions.createFree(saved.id);
    await this.settings.createDefault(saved.id);
    return this.buildResponse(saved);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.userRepo.findOneBy({ email: dto.email });
    const valid = user && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!valid) throw new UnauthorizedException('Invalid email or password');
    return this.buildResponse(user);
  }

  async verifyPassword(email: string, password: string): Promise<boolean> {
    const user = await this.userRepo.findOneBy({ email });
    if (!user) return false;
    return bcrypt.compare(password, user.passwordHash);
  }

  private buildResponse(user: UserEntity): AuthResponse {
    return {
      accessToken: this.jwtService.sign({ sub: user.id, email: user.email }),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarInitials: user.avatarInitials,
      },
    };
  }
}
