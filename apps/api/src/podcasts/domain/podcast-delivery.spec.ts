import { podcastDeliveryText } from './podcast-delivery';

describe('podcastDeliveryText', () => {
  it('renders stage directions only for audio without modifying learner text', () => {
    const turn = { targetText: 'Das ist ideal!', audioTags: ['short pause', 'relieved'] as const };
    expect(podcastDeliveryText(turn)).toBe('[short pause] [relieved] Das ist ideal!');
    expect(turn.targetText).toBe('Das ist ideal!');
  });
  it('keeps legacy transcripts unchanged', () => {
    expect(podcastDeliveryText({ targetText: 'Hallo!' })).toBe('Hallo!');
  });
});
