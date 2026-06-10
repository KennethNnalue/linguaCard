import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webpush from 'web-push';
import type { PushSubscriptionDto } from '@lingua-card/shared/domain';
import { PushSubscriptionEntity } from './push-subscription.entity';
import { PushConfig } from './push.config';

export interface PushPayload { title: string; body: string; url?: string; }

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly vapidReady: boolean;

  constructor(
    @InjectRepository(PushSubscriptionEntity)
    private readonly repo: Repository<PushSubscriptionEntity>,
    private readonly config: PushConfig,
  ) {
    this.vapidReady = !!(config.publicKey && config.privateKey);
    if (this.vapidReady) {
      webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    } else {
      this.logger.warn('VAPID keys not configured — web push notifications disabled');
    }
  }

  async subscribe(userId: string, sub: PushSubscriptionDto): Promise<void> {
    await this.repo.save(this.repo.create({
      endpoint: sub.endpoint,
      userId,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    }));
  }

  async unsubscribe(endpoint: string): Promise<void> {
    await this.repo.delete({ endpoint });
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.vapidReady) return;
    const subs = await this.repo.find({ where: { userId } });
    await Promise.all(subs.map(s => this.sendOne(s, payload)));
  }

  private async sendOne(s: PushSubscriptionEntity, payload: PushPayload): Promise<void> {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ notification: { title: payload.title, body: payload.body, data: { url: payload.url ?? '/review' } } }),
      );
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await this.unsubscribe(s.endpoint);
        this.logger.log(`Pruned expired subscription ${s.endpoint.slice(0, 32)}…`);
      } else {
        this.logger.warn(`Push send failed: ${(err as Error).message}`);
      }
    }
  }
}
