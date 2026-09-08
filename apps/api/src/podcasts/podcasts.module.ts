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
import { AiModule } from '../ai/ai.module';
import { PodcastTranscriptGenerationService } from './services/podcast-transcript-generation.service';
import { ElevenLabsPodcastAdapter } from './infrastructure/elevenlabs-podcast.adapter';
import { ElevenLabsPodcastGenerationService } from './services/elevenlabs-podcast-generation.service';
import { PodcastEpisodeCreationService } from './services/podcast-episode-creation.service';
import { EngagementModule } from '../engagement/engagement.module';
import { SettingsModule } from '../settings/settings.module';
import { WordDictionaryModule } from '../word-dictionary/word-dictionary.module';
import { PodcastPlatformCollectionService } from './services/podcast-platform-collection.service';
import { PodcastTranscriptManifestService } from './services/podcast-transcript-manifest.service';

@Module({
  imports: [
    TypeOrmModule.forFeature(PODCAST_ENTITIES),
    forwardRef(() => AuthModule),
    VocabularyModule,
    AiModule,
    EngagementModule,
    SettingsModule,
    WordDictionaryModule,
  ],
  controllers: [AdminPodcastsController, AdminPodcastEpisodesController, PodcastsController],
  providers: [
    AdminPodcastsService, PodcastThumbnailService, PodcastTranscriptImportService,
    PodcastAudioGenerationService, ElevenLabsDialogueAdapter, StorageService,
    PodcastCatalogueService,
    PodcastLearningLoopService,
    PodcastTranscriptGenerationService, ElevenLabsPodcastAdapter,
    ElevenLabsPodcastGenerationService,
    PodcastEpisodeCreationService,
    PodcastPlatformCollectionService,
    PodcastTranscriptManifestService,
  ],
  exports: [AdminPodcastsService],
})
export class PodcastsModule {}
