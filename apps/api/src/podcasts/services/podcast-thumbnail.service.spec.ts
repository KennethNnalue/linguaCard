import { describe, expect, it } from '@jest/globals';
import { calculateCoverCrop } from './podcast-thumbnail.service';

describe('calculateCoverCrop', () => {
  it('keeps a centered 16:9 image unchanged', () => {
    expect(calculateCoverCrop(1280, 720, 16 / 9, { x: 0.5, y: 0.5 })).toEqual({
      left: 0,
      top: 0,
      width: 1280,
      height: 720,
    });
  });

  it('uses the horizontal focal point when cropping a wide image', () => {
    expect(calculateCoverCrop(2000, 720, 16 / 9, { x: 0.8, y: 0.5 })).toEqual({
      left: 720,
      top: 0,
      width: 1280,
      height: 720,
    });
  });

  it('clamps a focal point so the crop never leaves the source image', () => {
    expect(calculateCoverCrop(1000, 1000, 16 / 9, { x: 0.5, y: 1 })).toEqual({
      left: 0,
      top: 437,
      width: 1000,
      height: 563,
    });
  });
});
