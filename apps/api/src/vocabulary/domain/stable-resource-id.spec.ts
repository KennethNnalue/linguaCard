import { describe, expect, it } from '@jest/globals';
import { stableResourceId } from './stable-resource-id';

describe('stableResourceId', () => {
  it('returns the same UUID-shaped identifier for the same resource identity', () => {
    const first = stableResourceId('lexeme', 'de', 'bahnhof', 'noun', 'article=der');
    const second = stableResourceId('lexeme', 'de', 'bahnhof', 'noun', 'article=der');

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('separates resource namespaces', () => {
    expect(stableResourceId('lexeme', 'same')).not.toBe(
      stableResourceId('lexeme-localization', 'same'),
    );
  });
});
