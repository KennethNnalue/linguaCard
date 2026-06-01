import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WordAudioEntity } from './word-audio.entity';
import { WordAudioRepository } from './word-audio.repository';
import { WordAudioService } from './word-audio.service';
import { WordAudioController } from './word-audio.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WordAudioEntity]),
    forwardRef(() => AiModule),
  ],
  controllers: [WordAudioController],
  providers: [WordAudioRepository, WordAudioService],
  exports: [WordAudioService],
})
export class WordAudioModule {}
