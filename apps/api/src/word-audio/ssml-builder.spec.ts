/*
import { buildWordSsml, buildStorySsml } from './ssml-builder';

describe('buildWordSsml()', () => {
  it('wraps short word in <speak><prosody rate="0.85">...</prosody></speak>', () => {
    const result = buildWordSsml('der Hund');
    expect(result).toBe('<speak><prosody rate="0.85">der Hund</prosody></speak>');
  });

  it('wraps long phrase (>4 words) in rate="0.90"', () => {
    const result = buildWordSsml('frei haben er hat frei');
    expect(result).toContain('rate="0.90"');
  });

  it('escapes & as &amp;', () => {
    expect(buildWordSsml('Hund & Katze')).toContain('Hund &amp; Katze');
  });

  it('escapes < as &lt;', () => {
    expect(buildWordSsml('a < b')).toContain('a &lt; b');
  });

  it('escapes > as &gt;', () => {
    expect(buildWordSsml('a > b')).toContain('a &gt; b');
  });

  it('escapes " as &quot;', () => {
    expect(buildWordSsml('say "hello"')).toContain('say &quot;hello&quot;');
  });

  it("escapes ' as &apos;", () => {
    expect(buildWordSsml("it's fine")).toContain("it&apos;s fine");
  });

  it('produces valid XML-safe output for real German vocab: "der Hund, -e"', () => {
    const result = buildWordSsml('der Hund, -e');
    expect(result).toContain('der Hund, -e');
    expect(result).not.toContain('&');
    expect(result).toMatch(/^<speak><prosody rate="0\.85">.*<\/prosody><\/speak>$/);
  });
});

describe('buildStorySsml()', () => {
  it('wraps text in <speak><prosody rate="0.92">...</prosody></speak>', () => {
    const result = buildStorySsml('Es war einmal ein Hund.');
    expect(result).toBe('<speak><prosody rate="0.92">Es war einmal ein Hund.</prosody></speak>');
  });

  it('escapes XML special characters', () => {
    const result = buildStorySsml('a & b < c > d "e" \'f\'');
    expect(result).toContain('a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;');
  });
});
*/
