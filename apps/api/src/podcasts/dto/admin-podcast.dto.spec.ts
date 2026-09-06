import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreatePodcastEpisodeDto,
  CreatePodcastTranscriptPromptDto,
  UpdatePodcastEpisodeDto,
} from './admin-podcast.dto';

describe('CreatePodcastEpisodeDto', () => {
  test('rejects blank and oversized vocabulary items', async () => {
    const blank = plainToInstance(CreatePodcastEpisodeDto, {
      requestId: '746df490-5622-4c45-8f43-3f9493e274aa', vocabulary: ['   '],
    });
    const oversized = plainToInstance(CreatePodcastEpisodeDto, {
      requestId: '746df490-5622-4c45-8f43-3f9493e274aa', vocabulary: ['x'.repeat(201)],
    });

    await expect(validate(blank)).resolves.not.toHaveLength(0);
    await expect(validate(oversized)).resolves.not.toHaveLength(0);
  });

  test('accepts a valid idempotent generation request', async () => {
    const dto = plainToInstance(CreatePodcastEpisodeDto, {
      requestId: '746df490-5622-4c45-8f43-3f9493e274aa',
      vocabulary: ['der Kaffee = coffee'], direction: 'At breakfast',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});

describe('UpdatePodcastEpisodeDto', () => {
  test('rejects a blank title', async () => {
    const dto = plainToInstance(UpdatePodcastEpisodeDto, { title: '   ' });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  test('accepts editable episode metadata', async () => {
    const dto = plainToInstance(UpdatePodcastEpisodeDto, {
      title: 'Ordering breakfast',
      titleTranslation: 'Frühstück bestellen',
      description: 'A café conversation.',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});

describe('CreatePodcastTranscriptPromptDto', () => {
  test('accepts an empty vocabulary list for external generation', async () => {
    const dto = plainToInstance(CreatePodcastTranscriptPromptDto, { vocabulary: [] });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
