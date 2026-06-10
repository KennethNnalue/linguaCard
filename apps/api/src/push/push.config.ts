import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PushConfig {
  readonly publicKey: string;
  readonly privateKey: string;
  readonly subject: string;

  constructor(config: ConfigService) {
    this.publicKey  = config.get<string>('VAPID_PUBLIC_KEY', '');
    this.privateKey = config.get<string>('VAPID_PRIVATE_KEY', '');
    this.subject    = config.get<string>('VAPID_SUBJECT', 'mailto:admin@linguacard.app');
  }
}
