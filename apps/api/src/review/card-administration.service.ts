import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { applyCardAdministration, CardAdministrationResult } from '@lingua-card/shared/domain';
import { CardEntity } from '../cards/card.entity';
import { CardAdministrationCommandDto } from './card-administration.dto';
import { CardAdministrationEventEntity } from './card-administration.entity';
import { ReviewSchedulingEntity } from './review-scheduling.entity';

@Injectable()
export class CardAdministrationService {
  constructor(private readonly dataSource: DataSource) {}

  execute(userId: string, cardId: string, command: CardAdministrationCommandDto): Promise<CardAdministrationResult> {
    return this.dataSource.transaction(async manager => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [command.commandId]);
      const events = manager.getRepository(CardAdministrationEventEntity);
      const existing = await events.findOneBy({ commandId: command.commandId });
      if (existing) {
        if (existing.userId !== userId || existing.cardId !== cardId || existing.type !== command.type) {
          throw new BadRequestException('Administrative command identifier is already in use');
        }
        return { event: existing.event, nextState: existing.nextState };
      }

      const card = await manager.getRepository(CardEntity).findOneBy({ id: cardId, userId });
      if (!card) throw new NotFoundException(`Card ${cardId} not found`);
      const scheduling = await manager.getRepository(ReviewSchedulingEntity).findOneBy({ cardId });
      if (!scheduling) throw new NotFoundException(`Scheduling state for card ${cardId} not found`);

      let result: CardAdministrationResult;
      const occurredAt = new Date();
      try {
        result = applyCardAdministration(scheduling.state, command, occurredAt, randomUUID());
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Administrative command is invalid');
      }

      scheduling.state = result.nextState;
      scheduling.stateUpdatedAt = occurredAt;
      await manager.getRepository(ReviewSchedulingEntity).save(scheduling);
      await events.save(events.create({
        eventId: result.event.eventId,
        commandId: command.commandId,
        userId,
        cardId,
        type: command.type,
        occurredAt,
        event: result.event,
        nextState: result.nextState,
      }));
      return result;
    });
  }
}
