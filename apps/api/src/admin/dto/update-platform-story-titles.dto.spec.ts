import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePlatformStoryTitlesDto } from './update-platform-story-titles.dto';

describe('UpdatePlatformStoryTitlesDto', () => {
  test('rejects blank translations and accepts two nonblank titles', async () => {
    const blank = plainToInstance(UpdatePlatformStoryTitlesDto, {
      title: 'Ein Tag in Berlin', titleTranslation: '   ',
    });
    const valid = plainToInstance(UpdatePlatformStoryTitlesDto, {
      title: 'Ein Tag in Berlin', titleTranslation: 'A Day in Berlin',
    });

    await expect(validate(blank)).resolves.not.toHaveLength(0);
    await expect(validate(valid)).resolves.toHaveLength(0);
  });
});
