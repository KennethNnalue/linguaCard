import {
  BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UploadedFile,
  UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type {
  AdminCommitPodcastTranscriptResult, AdminPodcastEpisodeListItem,
  AdminGeneratePodcastAudioResult, AdminPodcastTopicListItem,
  AdminPodcastTranscriptPreview, PodcastThumbnail, AdminGeneratePodcastTranscriptResult,
  AdminCreateElevenLabsPodcastResult,
  AdminPodcastTranscriptPromptResult,
} from '@lingua-card/shared/domain';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  CreatePodcastEpisodeDto,
  CreatePodcastEpisodeDraftDto,
  CreatePodcastTopicDto,
  PodcastThumbnailMetadataDto,
  UpdatePodcastTopicDto,
  CommitPodcastTranscriptDto,
  PodcastTranscriptPayloadDto,
  GeneratePodcastTranscriptDto,
  CreateElevenLabsPodcastDto,
} from '../dto/admin-podcast.dto';
import { AdminPodcastsService } from '../services/admin-podcasts.service';
import { PodcastTranscriptImportService } from '../services/podcast-transcript-import.service';
import { PodcastAudioGenerationService } from '../services/podcast-audio-generation.service';
import { PodcastTranscriptGenerationService } from '../services/podcast-transcript-generation.service';
import { ElevenLabsPodcastGenerationService } from '../services/elevenlabs-podcast-generation.service';
import { PodcastEpisodeCreationService } from '../services/podcast-episode-creation.service';

const THUMBNAIL_UPLOAD_OPTIONS = { limits: { fileSize: 5 * 1024 * 1024, files: 1 } };

@Controller('admin/podcast-topics')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminPodcastsController {
  constructor(
    private readonly podcasts: AdminPodcastsService,
    private readonly episodeCreation: PodcastEpisodeCreationService,
  ) {}

  @Get()
  listTopics(): Promise<AdminPodcastTopicListItem[]> {
    return this.podcasts.listTopics();
  }

  @Post()
  createTopic(@Body() dto: CreatePodcastTopicDto): Promise<AdminPodcastTopicListItem> {
    return this.podcasts.createTopic(dto);
  }

  @Patch(':topicId')
  updateTopic(
    @Param('topicId') topicId: string,
    @Body() dto: UpdatePodcastTopicDto,
  ): Promise<AdminPodcastTopicListItem> {
    return this.podcasts.updateTopic(topicId, dto);
  }

  @Post(':topicId/episodes')
  @HttpCode(HttpStatus.ACCEPTED)
  createEpisode(
    @Param('topicId') topicId: string,
    @Body() dto: CreatePodcastEpisodeDto,
  ): Promise<AdminPodcastEpisodeListItem> {
    return this.episodeCreation.create(topicId, dto);
  }

  @Post(':topicId/episode-drafts')
  @HttpCode(HttpStatus.CREATED)
  createEpisodeDraft(
    @Param('topicId') topicId: string,
    @Body() dto: CreatePodcastEpisodeDraftDto,
  ): Promise<AdminPodcastEpisodeListItem> {
    return this.podcasts.reserveEpisode(topicId, dto.requestId, null);
  }

  @Post(':topicId/thumbnail')
  @UseInterceptors(FileInterceptor('image', THUMBNAIL_UPLOAD_OPTIONS))
  uploadTopicThumbnail(
    @Param('topicId') topicId: string,
    @Body() metadata: PodcastThumbnailMetadataDto,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string },
  ): Promise<PodcastThumbnail> {
    return this.podcasts.attachTopicThumbnail(topicId, this.requireFile(file), metadata);
  }

  @Patch(':topicId/publish')
  publishTopic(@Param('topicId') topicId: string): Promise<AdminPodcastTopicListItem> {
    return this.podcasts.publishTopic(topicId);
  }

  private requireFile(
    file: { buffer: Buffer; mimetype: string } | undefined,
  ): { buffer: Buffer; mimetype: string } {
    if (!file) throw new BadRequestException('A thumbnail image is required');
    return file;
  }
}

@Controller('admin/podcast-episodes')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminPodcastEpisodesController {
  constructor(
    private readonly podcasts: AdminPodcastsService,
    private readonly transcriptImport: PodcastTranscriptImportService,
    private readonly audioGeneration: PodcastAudioGenerationService,
    private readonly transcriptGeneration: PodcastTranscriptGenerationService,
    private readonly elevenLabsPodcastGeneration: ElevenLabsPodcastGenerationService,
    private readonly episodeCreation: PodcastEpisodeCreationService,
  ) {}

  @Post(':episodeId/transcript/generate')
  generateTranscript(
    @Param('episodeId') episodeId: string,
    @Body() dto: GeneratePodcastTranscriptDto,
  ): Promise<AdminGeneratePodcastTranscriptResult> {
    return this.transcriptGeneration.generate(episodeId, dto.vocabulary, dto.direction);
  }

  @Post(':episodeId/retry-generation')
  @HttpCode(HttpStatus.ACCEPTED)
  retryGeneration(
    @Param('episodeId') episodeId: string,
  ): Promise<AdminPodcastEpisodeListItem> {
    return this.episodeCreation.retry(episodeId);
  }

  @Post(':episodeId/transcript/prompt')
  async createTranscriptPrompt(
    @Param('episodeId') episodeId: string,
    @Body() dto: GeneratePodcastTranscriptDto,
  ): Promise<AdminPodcastTranscriptPromptResult> {
    return { prompt: await this.transcriptGeneration.prompt(episodeId, dto.vocabulary, dto.direction) };
  }

  @Post(':episodeId/elevenlabs-podcast')
  createElevenLabsPodcast(
    @Param('episodeId') episodeId: string,
    @Body() dto: CreateElevenLabsPodcastDto,
  ): Promise<AdminCreateElevenLabsPodcastResult> {
    return this.elevenLabsPodcastGeneration.create(episodeId, dto.vocabulary);
  }

  @Post(':episodeId/transcript/preview')
  previewTranscript(
    @Param('episodeId') episodeId: string,
    @Body() payload: PodcastTranscriptPayloadDto,
  ): Promise<AdminPodcastTranscriptPreview> {
    return this.transcriptImport.preview(episodeId, payload);
  }

  @Post(':episodeId/generate-audio')
  generateAudio(
    @Param('episodeId') episodeId: string,
  ): Promise<AdminGeneratePodcastAudioResult> {
    return this.audioGeneration.generate(episodeId);
  }

  @Patch(':episodeId/publish')
  publishEpisode(
    @Param('episodeId') episodeId: string,
  ): Promise<AdminPodcastEpisodeListItem> {
    return this.podcasts.publishEpisode(episodeId);
  }

  @Post(':episodeId/transcript')
  commitTranscript(
    @Param('episodeId') episodeId: string,
    @Body() dto: CommitPodcastTranscriptDto,
  ): Promise<AdminCommitPodcastTranscriptResult> {
    return this.transcriptImport.commit(episodeId, dto);
  }

  @Post(':episodeId/thumbnail')
  @UseInterceptors(FileInterceptor('image', THUMBNAIL_UPLOAD_OPTIONS))
  uploadEpisodeThumbnail(
    @Param('episodeId') episodeId: string,
    @Body() metadata: PodcastThumbnailMetadataDto,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string },
  ): Promise<PodcastThumbnail> {
    if (!file) throw new BadRequestException('A thumbnail image is required');
    return this.podcasts.attachEpisodeThumbnail(episodeId, file, metadata);
  }
}
