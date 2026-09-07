import {
  buildPodcastTranscriptPrompt, podcastVocabularyTarget,
} from './podcast-transcript-prompt';

describe('buildPodcastTranscriptPrompt', () => {
  test('uses one policy for generated and manually copied transcripts', () => {
    const prompt = buildPodcastTranscriptPrompt({
      topicTitle: 'Im Café', topicDescription: 'Ordering drinks',
      targetLanguage: 'de', translationLanguage: 'en', level: 'A1',
      vocabulary: ['der Kaffee = coffee'], direction: 'Two friends at breakfast',
    });

    expect(prompt).toContain('Creative direction: Two friends at breakfast');
    expect(prompt).toContain('- der Kaffee = coffee');
    expect(prompt).toContain('Include 8 vocabulary items total');
    expect(prompt).toContain('designed to produce at least 3 minutes of audio');
    expect(prompt).toContain('aim for 1,750–1,950 target-language characters');
    expect(prompt).toContain('Use 18–26 concise turns');
    expect(prompt).toContain('preserve any supplied translation exactly');
  });

  it('instructs the external generator to choose vocabulary when none is supplied', () => {
    const prompt = buildPodcastTranscriptPrompt({
      topicTitle: 'At the café', topicDescription: '', targetLanguage: 'de',
      translationLanguage: 'en', level: 'A1', vocabulary: [],
    });

    expect(prompt).toContain('None supplied. Select 8 useful vocabulary items');
    expect(prompt).toContain('same A1 level');
  });

  it('scales the supporting vocabulary target with the supplied vocabulary', () => {
    expect(podcastVocabularyTarget(0)).toBe(8);
    expect(podcastVocabularyTarget(4)).toBe(8);
    expect(podcastVocabularyTarget(5)).toBe(12);
    expect(podcastVocabularyTarget(11)).toBe(12);
    expect(podcastVocabularyTarget(12)).toBe(15);
    expect(podcastVocabularyTarget(15)).toBe(15);
    expect(podcastVocabularyTarget(20)).toBe(20);
  });
});
