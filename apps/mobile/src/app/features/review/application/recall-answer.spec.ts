import { canSubmitRecallAnswer, insertRecallCharacter } from './recall-answer';

describe('recall answer application rules', () => {
  it('requires at least one non-whitespace grapheme before submission', () => {
    expect(canSubmitRecallAnswer('   ')).toBe(false);
    expect(canSubmitRecallAnswer('ß')).toBe(true);
  });

  it('inserts a language helper at the active selection', () => {
    expect(insertRecallCharacter('schon', 'ö', { start: 3, end: 4 })).toEqual({ answer: 'schön', caret: 4 });
  });

  it('clamps stale selection positions after a render', () => {
    expect(insertRecallCharacter('der', 'ß', { start: 20, end: 30 })).toEqual({ answer: 'derß', caret: 4 });
  });
});
