import { createPodcastTranscriptManifestDraft } from './podcast-transcript-manifest';

describe('podcast transcript manifest', () => {
  it('assigns stable keys while retaining source notation and sense context', () => {
    const manifest = createPodcastTranscriptManifestDraft([
      'das Kinderzimmer, -',
      'die Küche, -n = kitchen',
      'ziehen, er zieht, ist gezogen (Beata ist in eine Wohnung gezogen.)',
    ], 'de', 'en');

    expect(manifest.id).toMatch(/^[a-f0-9]{64}$/u);
    expect(manifest.items).toEqual([
      {
        key: 'kinderzimmer', text: 'Kinderzimmer', originalInput: 'das Kinderzimmer, -',
        translation: null, article: 'das', canonicalLexemeId: null,
      },
      {
        key: 'kueche', text: 'Küche', originalInput: 'die Küche, -n = kitchen',
        translation: 'kitchen', article: 'die', canonicalLexemeId: null,
      },
      {
        key: 'ziehen', text: 'ziehen',
        originalInput: 'ziehen, er zieht, ist gezogen (Beata ist in eine Wohnung gezogen.)',
        translation: null, article: null, canonicalLexemeId: null,
      },
    ]);
  });
});
