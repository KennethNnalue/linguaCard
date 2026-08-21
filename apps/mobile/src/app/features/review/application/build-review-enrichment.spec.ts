import type { CardContent } from '@lingua-card/shared/domain';
import { buildReviewEnrichment, nextReviewEnrichmentTab } from './build-review-enrichment';

const content = (patch: Partial<CardContent> = {}): CardContent => ({
  front: 'bandage', back: 'Verband', article: 'der', gender: 'masculine', plural: 'die Verbände',
  examples: [{ id: 'ex', target: 'Der Verband hilft.', native: 'The bandage helps.' }], synonyms: [],
  notes: '', imageUrl: null, phonetic: null, ...patch,
});

describe('review enrichment application rules', () => {
  it('shows Examples only when another example remains after the primary usage example', () => {
    expect(buildReviewEnrichment(content({
      examples: [
        { id: 'primary', target: 'Der Verband hilft.', native: 'The bandage helps.' },
        { id: 'extra', target: 'Ich wechsle den Verband.', native: 'I change the bandage.' },
      ],
      synonyms: [{ word: 'Bandage', article: 'die', translation: 'bandage', example: '', exampleNative: '' }],
    })).tabs)
      .toEqual(['examples', 'synonyms']);
  });

  it('shows Synonyms as the only tab when there is one usage example', () => {
    expect(buildReviewEnrichment(content({
      synonyms: [{ word: 'Bandage', article: 'die', translation: 'bandage', example: '', exampleNative: '' }],
    }))).toEqual({ tabs: ['synonyms'], initialTab: 'synonyms' });
  });

  it('hides the tab area when the primary usage example has no extra enrichment', () => {
    expect(buildReviewEnrichment(content())).toEqual({ tabs: [], initialTab: null });
  });

  it('omits empty enrichment instead of rendering empty panels', () => {
    expect(buildReviewEnrichment(content({ article: null, plural: null, examples: [], notes: '', synonyms: [] })))
      .toEqual({ tabs: [], initialTab: null });
  });

  it('wraps arrow-key tab navigation', () => {
    expect(nextReviewEnrichmentTab(['examples', 'synonyms'], 'synonyms', 1)).toBe('examples');
    expect(nextReviewEnrichmentTab(['examples', 'synonyms'], 'examples', -1)).toBe('synonyms');
  });
});
