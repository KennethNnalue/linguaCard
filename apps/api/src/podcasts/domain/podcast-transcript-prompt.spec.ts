import {
  buildPodcastTranscriptPrompt, normalizePodcastVocabulary, normalizePodcastVocabularyItem, hasBalancedVocabularyParentheses, podcastVocabularyTarget,
} from './podcast-transcript-prompt';
import { createPodcastTranscriptManifestDraft } from './podcast-transcript-manifest';

describe('buildPodcastTranscriptPrompt', () => {
  test('uses one policy for generated and manually copied transcripts', () => {
    const prompt = buildPodcastTranscriptPrompt({
      topicTitle: 'Im Café', topicDescription: 'Ordering drinks',
      targetLanguage: 'de', translationLanguage: 'en', level: 'A1',
      vocabulary: ['der Kaffee = coffee'], direction: 'Two friends at breakfast',
    });

    expect(prompt).toContain('Creative direction: Two friends at breakfast');
    expect(prompt).toContain('- Kaffee = coffee');
    expect(prompt).toContain('Include 8 vocabulary items total');
    expect(prompt).toContain('Aim for a little over 2 minutes');
    expect(prompt).toContain('aim for 1,750–1,950 target-language characters');
    expect(prompt).toContain('Use about 18–26 concise turns');
    expect(prompt).toContain('Count only targetText');
    expect(prompt).toContain('preserve any supplied translation exactly');
    expect(prompt).toContain('must contain every supplied headword exactly once');
  });

  it('instructs the external generator to choose vocabulary when none is supplied', () => {
    const prompt = buildPodcastTranscriptPrompt({
      topicTitle: 'At the café', topicDescription: '', targetLanguage: 'de',
      translationLanguage: 'en', level: 'A1', vocabulary: [],
    });

    expect(prompt).toContain('None supplied by LinguaCard');
    expect(prompt).toContain('Vocabulary input:');
    expect(prompt).not.toContain('Required vocabulary (0 supplied');
    expect(prompt).toContain('If no vocabulary list is supplied anywhere with this prompt');
    expect(prompt).toContain('If a list is supplied alongside this prompt, include every item');
    expect(prompt).toContain('"neben (+ D.)" becomes "neben"');
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

  it('requests a longer episode when 15 or more vocabulary items are supplied', () => {
    const context = {
      topicTitle: 'At work', topicDescription: '', targetLanguage: 'de' as const,
      translationLanguage: 'en' as const, level: 'A2' as const,
    };
    const shortPrompt = buildPodcastTranscriptPrompt({
      ...context, vocabulary: Array.from({ length: 14 }, (_, index) => `word-${index}`),
    });
    const extendedPrompt = buildPodcastTranscriptPrompt({
      ...context, vocabulary: Array.from({ length: 15 }, (_, index) => `word-${index}`),
    });

    expect(shortPrompt).toContain('Aim for a little over 2 minutes');
    expect(shortPrompt).not.toContain('Use about 26–36 concise turns');
    expect(extendedPrompt).toContain('Aim for 3–5 minutes of spoken audio');
    expect(extendedPrompt).toContain('at least 3 minutes for 15 or more supplied vocabulary items');
    expect(extendedPrompt).toContain('Use about 26–36 concise turns');
    expect(extendedPrompt).toContain('aim for 1,900–1,990 target-language characters');
    expect(extendedPrompt).toContain('maximum of 2,000 characters');
  });

  it('reduces dictionary entries to clean headwords while preserving translations', () => {
    expect(normalizePodcastVocabulary([
      'die Einweihungsfeier, -n',
      'genau (Wo genau sind die Dinge?)',
      'hinter (+ D.)',
      'über (+ D.) (Das Bild ist über dem Fernseher.)',
      'aus|sehen, er sieht aus, hat ausgesehen',
      'die Begeisterung (Sg.)',
      'doch (Die Lampe ist doch toll!)',
      'ja (Liest du gern? - Ja, sehr gern.)',
      'so (Schwimmst du gern? - Nein, nicht so gern.)',
      'nicht mehr',
      'die Äußerung, -en = statement',
    ])).toEqual([
      'Einweihungsfeier', 'genau', 'hinter', 'über', 'aussehen',
      'Begeisterung', 'doch', 'ja', 'so', 'nicht mehr', 'Äußerung = statement',
    ]);
  });

  it('includes every cleaned supplied item when the list exceeds the supporting range', () => {
    const vocabulary = [
      'die Einweihungsfeier, -n', 'genau (Wo genau sind die Dinge?)', 'hinter (+ D.)',
      'neben (+ D.)', 'über (+ D.) (Das Bild ist über dem Fernseher.)', 'unter (+ D.)',
      'zwischen (+ D.)', 'aus|sehen, er sieht aus, hat ausgesehen', 'die Begeisterung (Sg.)',
      'doch (Die Lampe ist doch toll!)', 'gemütlich', 'hässlich', 'nicht mehr',
      'die Äußerung, -en', 'negativ', 'positiv', 'braun', 'gelb', 'grau', 'lila',
      'orange', 'schwarz', 'weiß',
    ];
    const prompt = buildPodcastTranscriptPrompt({
      topicTitle: 'Meine Wohnung', topicDescription: '', targetLanguage: 'de',
      translationLanguage: 'en', level: 'A1', vocabulary,
    });
    const requiredVocabularySection = prompt.split('\n\nSchema:', 1)[0];

    expect(prompt).toContain('Required vocabulary (23 supplied; use every item');
    expect(prompt).toContain('- Einweihungsfeier');
    expect(prompt).toContain('- neben\n');
    expect(prompt).toContain('- doch\n');
    expect(prompt).toContain('- aussehen\n');
    expect(prompt).toContain('Include 23 vocabulary items total');
    expect(requiredVocabularySection).not.toContain('(+ D.)');
    expect(requiredVocabularySection).not.toContain('Die Lampe ist doch toll!');
    expect(requiredVocabularySection).not.toContain('hat ausgesehen');
  });

  it('exports a versioned external-import contract with LinguaCard-owned keys', () => {
    const manifest = createPodcastTranscriptManifestDraft([
      'das Kinderzimmer, -',
      'ziehen, er zieht, ist gezogen (Beata ist in eine Wohnung gezogen.)',
    ], 'de', 'en');
    const prompt = buildPodcastTranscriptPrompt({
      topicTitle: 'Meine Wohnung', topicDescription: '', targetLanguage: 'de',
      translationLanguage: 'en', level: 'A1', vocabulary: [], manifest,
    });

    expect(prompt).toContain(`"schemaVersion":2,"manifestId":"${manifest.id}"`);
    expect(prompt).toContain('"key":"kinderzimmer"');
    expect(prompt).toContain('"sourceContext":"das Kinderzimmer, -"');
    expect(prompt).toContain('Beata ist in eine Wohnung gezogen.');
    expect(prompt).toContain('Copy every supplied LinguaCard key and text exactly');
  });
});

describe('vocabulary annotation validation', () => {
  it('rejects the observed truncated example rather than creating a malformed headword', () => {
    expect(hasBalancedVocabularyParentheses('also (Meine Mutter ist Italienerin')).toBe(false);
    expect(normalizePodcastVocabularyItem('also (Meine Mutter ist Italienerin')).toBe('also');
    expect(hasBalancedVocabularyParentheses('also)')).toBe(false);
  });
  it('preserves multiword expressions and complete annotations', () => {
    expect(normalizePodcastVocabularyItem('teilnehmen (an + D.) = take part')).toBe('teilnehmen = take part');
    expect(normalizePodcastVocabularyItem('von ... nach = from ... to')).toBe('von ... nach = from ... to');
  });
});
