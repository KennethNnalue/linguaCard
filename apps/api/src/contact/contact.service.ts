import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { UpgradeRequestDto } from '@lingua-card/shared/domain';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly toEmail = 'kennethnnalue.dev@gmail.com';

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host:   this.config.get<string>('SMTP_HOST',  'smtp.gmail.com'),
      port:   this.config.get<number>('SMTP_PORT',  587),
      secure: false,
      auth: {
        user: this.config.get<string>('SMTP_USER', ''),
        pass: this.config.get<string>('SMTP_PASS', ''),
      },
    });
  }

  async sendUpgradeRequest(dto: UpgradeRequestDto, userId?: string): Promise<void> {
    const subject = `LinguaCard Pro Upgrade Request — ${dto.name}`;
    const body = `
New Pro upgrade request from LinguaCard:

Name:    ${dto.name}
Email:   ${dto.email}
User ID: ${userId ?? 'not logged in'}
Message: ${dto.message || '(none)'}

---
To activate Pro, run in your DB:
UPDATE subscriptions SET tier = 'pro', activated_at = NOW(), notes = 'Manual - ${new Date().toISOString().slice(0, 10)}'
WHERE user_id = '${userId ?? 'FIND BY EMAIL'}';
`.trim();

    try {
      await this.transporter.sendMail({
        from:    this.config.get<string>('SMTP_FROM', 'noreply@linguacard.app'),
        to:      this.toEmail,
        subject,
        text:    body,
      });
      this.logger.log(`Upgrade request email sent for ${dto.email}`);
    } catch (err) {
      // Log but don't throw — user already submitted the form successfully
      this.logger.error('Failed to send upgrade email', err);
    }
  }
}
