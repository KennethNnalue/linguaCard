import { buildPodcastTranscriptPrompt } from './podcast-transcript-prompt';

describe('buildPodcastTranscriptPrompt', () => {
  test('uses one policy for generated and manually copied transcripts', () => {
    const prompt = buildPodcastTranscriptPrompt({
      topicTitle: 'Im Café', topicDescription: 'Ordering drinks',
      targetLanguage: 'de', translationLanguage: 'en', level: 'A1',
      vocabulary: ['der Kaffee = coffee'], direction: 'Two friends at breakfast',
    });

    expect(prompt).toContain('Creative direction: Two friends at breakfast');
    expect(prompt).toContain('- der Kaffee = coffee');
    expect(prompt).toContain('Include 8–15 vocabulary items total');
    expect(prompt).toContain('preserve any supplied translation exactly');
  });
});
