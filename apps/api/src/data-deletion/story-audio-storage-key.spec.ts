import { storyAudioStorageKey } from './story-audio-storage-key';

describe('storyAudioStorageKey', () => {
  it.each([
    ['https://audio.lingua-card.app/stories/story-1.wav', 'stories/story-1.wav'],
    ['http://localhost:3001/uploads/stories/story-1.wav', 'stories/story-1.wav'],
  ])('extracts an owned story object key from %s', (url, expected) => {
    expect(storyAudioStorageKey(url)).toBe(expected);
  });

  it.each([
    'https://example.com/image.png',
    'https://audio.lingua-card.app/podcasts/episode.mp3',
    'not-a-url',
  ])('rejects a URL outside the story-audio prefix', url => {
    expect(storyAudioStorageKey(url)).toBeNull();
  });
});
