import {
  parsePodcastVocabularyInput,
  podcastGenerationDirection,
} from './podcast-vocabulary-input';

describe('podcast vocabulary input', () => {
  it('extracts an episode title and every entry from the keyed array format', () => {
    const result = parsePodcastVocabularyInput(`"Die neue Wohnung": [
  "stellen (Carla will den Computer in die Küche stellen.)",
  "der Umzug, \\"-e",
  "die Vermieterin, -nen"
],`);

    expect(result).toEqual({
      episodeTitle: 'Die neue Wohnung',
      vocabulary: [
        'stellen (Carla will den Computer in die Küche stellen.)',
        'der Umzug, "-e',
        'die Vermieterin, -nen',
      ],
    });
  });

  it('continues to accept one plain vocabulary entry per line', () => {
    expect(parsePodcastVocabularyInput('stellen\npacken\n')).toEqual({
      episodeTitle: null,
      vocabulary: ['stellen', 'packen'],
    });
  });

  it('combines an extracted title with optional creative direction', () => {
    expect(podcastGenerationDirection('Die neue Wohnung', 'Keep it at A1.'))
      .toBe('Use “Die neue Wohnung” as the exact episode title. Keep it at A1.');
  });
});
