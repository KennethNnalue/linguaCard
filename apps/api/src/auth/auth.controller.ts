import {
  Body, Controller, Delete, HttpCode, HttpStatus, Post, UnauthorizedException,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from '@lingua-card/shared/dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

class VerifyPasswordDto {
  @IsString() email!: string;
  @IsString() password!: string;
}

class ForgotPasswordDto {
  @IsString() email!: string;
}

class DeleteAccountDto {
  @IsString() password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('verify-password')
  async verifyPassword(@Body() dto: VerifyPasswordDto) {
    const valid = await this.authService.verifyPassword(dto.email, dto.password);
    if (!valid) throw new UnauthorizedException('Incorrect password');
    return { valid: true };
  }

  @Public()
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    void dto;
    return { message: 'If that email exists, a reset link has been sent.' };
  }

  @Delete('account')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAccount(
    @CurrentUser() userId: string,
    @Body() dto: DeleteAccountDto,
  ): Promise<void> {
    return this.authService.deleteAccount(userId, dto.password);
  }
}
