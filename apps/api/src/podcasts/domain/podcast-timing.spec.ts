import { describe, expect, it } from '@jest/globals';
import {
  dialogueDurationMs, normalizeForcedAlignmentTimings, normalizePodcastTimings,
} from './podcast-timing';

const alignment = {
  characters: [...'Guten TagDanke'],
  characterStartTimesSeconds: [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1, 1.1, 1.2, 1.3],
  characterEndTimesSeconds: [.1, .2, .3, .4, .5, .6, .7, .8, .9, 1, 1.1, 1.2, 1.3, 1.4],
};

const segments = [
  { voiceId: 'a', startTimeSeconds: 0, endTimeSeconds: .9, characterStartIndex: 0, characterEndIndex: 9, dialogueInputIndex: 0 },
  { voiceId: 'b', startTimeSeconds: .9, endTimeSeconds: 1.4, characterStartIndex: 9, characterEndIndex: 14, dialogueInputIndex: 1 },
];

describe('podcast timing normalization', () => {
  it('maps character alignment into turn and word timings', () => {
    expect(normalizePodcastTimings(2, alignment, segments)).toEqual([
      {
        turnIndex: 0, startMs: 0, endMs: 900,
        words: [
          { text: 'Guten', startMs: 0, endMs: 500 },
          { text: 'Tag', startMs: 600, endMs: 900 },
        ],
      },
      {
        turnIndex: 1, startMs: 900, endMs: 1400,
        words: [{ text: 'Danke', startMs: 900, endMs: 1400 }],
      },
    ]);
  });

  it('uses the latest alignment or voice-segment boundary as duration', () => {
    expect(dialogueDurationMs(alignment, segments)).toBe(1400);
  });

  it('uses word timings measured from the final audio', () => {
    expect(normalizeForcedAlignmentTimings(
      ['Guten Tag!', 'Ein Kaffee, bitte.'],
      [
        { text: 'Guten', startTimeSeconds: .2, endTimeSeconds: .55 },
        { text: 'Tag!', startTimeSeconds: .6, endTimeSeconds: .9 },
        { text: 'Ein', startTimeSeconds: 1.4, endTimeSeconds: 1.55 },
        { text: 'Kaffee,', startTimeSeconds: 1.58, endTimeSeconds: 2.05 },
        { text: 'bitte.', startTimeSeconds: 2.1, endTimeSeconds: 2.5 },
      ],
    )).toEqual([
      {
        turnIndex: 0, startMs: 200, endMs: 900,
        words: [
          { text: 'Guten', startMs: 200, endMs: 550 },
          { text: 'Tag!', startMs: 600, endMs: 900 },
        ],
      },
      {
        turnIndex: 1, startMs: 1400, endMs: 2500,
        words: [
          { text: 'Ein', startMs: 1400, endMs: 1550 },
          { text: 'Kaffee,', startMs: 1580, endMs: 2050 },
          { text: 'bitte.', startMs: 2100, endMs: 2500 },
        ],
      },
    ]);
  });

  it('rejects an alignment whose word count does not match the transcript', () => {
    expect(normalizeForcedAlignmentTimings(
      ['Guten Tag'], [{ text: 'Guten', startTimeSeconds: 0, endTimeSeconds: .4 }],
    )).toEqual([]);
  });
});
