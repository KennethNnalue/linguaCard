import { reviewHistoryCutoff } from './index';

describe('reviewHistoryCutoff', () => {
  it('keeps the time of day and clamps month-end dates', () => {
    expect(reviewHistoryCutoff(new Date('2026-05-31T14:20:00.000Z')).toISOString())
      .toBe('2026-02-28T14:20:00.000Z');
    expect(reviewHistoryCutoff(new Date('2026-09-13T07:00:00.000Z')).toISOString())
      .toBe('2026-06-13T07:00:00.000Z');
  });
});
