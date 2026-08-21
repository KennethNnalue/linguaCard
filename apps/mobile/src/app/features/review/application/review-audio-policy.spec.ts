import { shouldAutoplayFirstExample, shouldAutoplayReviewAnswer } from './review-audio-policy';

describe('review audio policy', () => {
  it('defaults to no autoplay and respects mute, visibility, and data saver', () => {
    expect(shouldAutoplayReviewAnswer({ mode: 'off', muted: false, documentVisible: true, saveData: false })).toBe(false);
    expect(shouldAutoplayReviewAnswer({ mode: 'answer', muted: true, documentVisible: true, saveData: false })).toBe(false);
    expect(shouldAutoplayReviewAnswer({ mode: 'answer', muted: false, documentVisible: false, saveData: false })).toBe(false);
    expect(shouldAutoplayReviewAnswer({ mode: 'answer', muted: false, documentVisible: true, saveData: true })).toBe(false);
  });

  it('allows the first example only in answer-and-example mode', () => {
    expect(shouldAutoplayFirstExample({ mode: 'answer', muted: false, documentVisible: true, saveData: false })).toBe(false);
    expect(shouldAutoplayFirstExample({ mode: 'answer_and_example', muted: false, documentVisible: true, saveData: false })).toBe(true);
  });
});
