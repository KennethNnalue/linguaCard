import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService) {}
  @Public()
  @Get()
  check() {
    return { status: 'ok', revision: this.config.get<string>('RENDER_GIT_COMMIT') ?? this.config.get<string>('GIT_COMMIT') ?? null };
  }
}
