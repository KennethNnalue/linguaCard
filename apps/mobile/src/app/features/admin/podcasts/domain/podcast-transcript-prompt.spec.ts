import { buildPodcastTranscriptPrompt } from './podcast-transcript-prompt';

describe('buildPodcastTranscriptPrompt', () => {
  test('includes episode context and the required JSON contract', () => {
    const topic = {
      title: 'At the café', description: 'Order refreshments',
      targetLanguage: 'de', translationLanguage: 'en',
    } as const;
    const episode = {
      title: 'Ordering a drink', description: 'Ask for coffee', level: 'A1',
    } as const;

    const prompt = buildPodcastTranscriptPrompt(
      topic,
      episode,
      'Title: Und was hast du gemacht\nArbeit\nheiraten',
    );

    expect(prompt).toContain('Target language: de');
    expect(prompt).toContain('Episode: Ordering a drink');
    expect(prompt).toContain('"schemaVersion": 1');
    expect(prompt).toContain('below 2,000 characters');
    expect(prompt).toContain('Return valid JSON only');
    expect(prompt).toContain('Title: Und was hast du gemacht');
    expect(prompt).toContain('"episode"');
    expect(prompt).toContain('title inspiration, not as vocabulary');
    expect(prompt).toContain('It does not need to match the existing episode name');
    expect(prompt).toContain('"voiceGender": "female"');
    expect(prompt).toContain('"voiceGender": "male"');
    expect(prompt).toContain('matching each speaker\'s voiceGender');
    expect(prompt).not.toContain('REPLACE_WITH_ELEVENLABS_VOICE_ID');
    expect(prompt).toContain('assigns a provider voice matching');
  });

  test('asks the AI to select vocabulary when the administrator leaves the list empty', () => {
    const prompt = buildPodcastTranscriptPrompt(
      {
        title: 'At the café', description: '',
        targetLanguage: 'de', translationLanguage: 'en',
      },
      { title: 'Ordering', description: '', level: 'A1' },
      '   ',
    );

    expect(prompt).toContain('Administrator-supplied vocabulary: none.');
    expect(prompt).toContain('infer a coherent everyday scenario');
  });
});
