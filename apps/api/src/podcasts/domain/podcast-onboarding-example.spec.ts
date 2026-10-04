import { transcriptContainsHeadword } from './podcast-onboarding-example';
describe('factual card-to-conversation example', () => {
  it('matches whole words and phrases case-insensitively with Unicode boundaries', () => {
    expect(transcriptContainsHeadword('Der Platz ist frei.', 'Platz')).toBe(true);
    expect(transcriptContainsHeadword('Mein Arbeitsplatz ist hier.', 'Platz')).toBe(false);
    expect(transcriptContainsHeadword('Ich möchte zum Beispiel Tee.', 'zum Beispiel')).toBe(true);
    expect(transcriptContainsHeadword('Das ist schön.', 'schön')).toBe(true);
    expect(transcriptContainsHeadword('Was möchtest du?', 'möchten')).toBe(false);
  });
  it('does not turn imported punctuation into regex syntax or invent missing evidence', () => {
    expect(transcriptContainsHeadword('Hallo!', '')).toBe(false);
    expect(transcriptContainsHeadword('ein Wort', '.*')).toBe(false);
    expect(transcriptContainsHeadword('Eine Wohnung.', 'Wohnung (house)')).toBe(false);
  });
});
