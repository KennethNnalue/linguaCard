import {
  Controller, Post, Body, UnauthorizedException,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from '@lingua-card/shared/dto';

class VerifyPasswordDto {
  @IsString() email!: string;
  @IsString() password!: string;
}

class ForgotPasswordDto {
  @IsString() email!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('verify-password')
  async verifyPassword(@Body() dto: VerifyPasswordDto) {
    const valid = await this.authService.verifyPassword(dto.email, dto.password);
    if (!valid) throw new UnauthorizedException('Incorrect password');
    return { valid: true };
  }

  @Post('forgot-password')
  forgotPassword(@Body() _dto: ForgotPasswordDto) {
    return { message: 'If that email exists, a reset link has been sent.' };
  }
}
