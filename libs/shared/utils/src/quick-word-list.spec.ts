import {QUICK_WORD_LIST_MAX_ITEMS, validateQuickWordList} from './index';

describe('validateQuickWordList', () => {
  it('accepts a normal quick word list', () => {
    expect(validateQuickWordList(['der Apfel', 'trinken', 'die Reise'])).toEqual({valid: true});
  });

  it('directs enriched JSON to the enriched import flow', () => {
    expect(validateQuickWordList([
      '[',
      '{',
      '"back": "Apfel",',
      '"front": "apple"',
    ])).toEqual({
      valid: false,
      code: 'enriched-json',
      message: 'This looks like enriched JSON. Use the Enriched JSON import instead.',
    });
  });

  it('rejects an oversized quick word list', () => {
    const words = Array.from({length: QUICK_WORD_LIST_MAX_ITEMS + 1}, (_, index) => `Wort ${index + 1}`);

    expect(validateQuickWordList(words)).toEqual({
      valid: false,
      code: 'too-many-items',
      message: `Quick word lists support at most ${QUICK_WORD_LIST_MAX_ITEMS} words.`,
    });
  });
});
