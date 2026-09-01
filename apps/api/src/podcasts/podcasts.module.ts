import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { StorageService } from '../storage/storage.service';
import {
  AdminPodcastEpisodesController, AdminPodcastsController,
} from './controllers/admin-podcasts.controller';
import { PODCAST_ENTITIES } from './entities';
import { AdminPodcastsService } from './services/admin-podcasts.service';
import { PodcastThumbnailService } from './services/podcast-thumbnail.service';
import { PodcastTranscriptImportService } from './services/podcast-transcript-import.service';
import { VocabularyModule } from '../vocabulary/vocabulary.module';
import { ElevenLabsDialogueAdapter } from './infrastructure/elevenlabs-dialogue.adapter';
import { PodcastAudioGenerationService } from './services/podcast-audio-generation.service';
import { PodcastsController } from './controllers/podcasts.controller';
import { PodcastCatalogueService } from './services/podcast-catalogue.service';
import { PodcastLearningLoopService } from './services/podcast-learning-loop.service';

@Module({
  imports: [
    TypeOrmModule.forFeature(PODCAST_ENTITIES),
    forwardRef(() => AuthModule),
    VocabularyModule,
  ],
  controllers: [AdminPodcastsController, AdminPodcastEpisodesController, PodcastsController],
  providers: [
    AdminPodcastsService, PodcastThumbnailService, PodcastTranscriptImportService,
    PodcastAudioGenerationService, ElevenLabsDialogueAdapter, StorageService,
    PodcastCatalogueService,
    PodcastLearningLoopService,
  ],
  exports: [AdminPodcastsService],
})
export class PodcastsModule {}
