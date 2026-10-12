import {pronunciationWithLeadIn, PRONUNCIATION_LEAD_IN_MS} from './pronunciation-audio-padding';

describe('pronunciationWithLeadIn', () => {
  it.each([0.75, 0.95, 1, 1.25, 1.5])('protects the first phoneme for %s playback speed', rate => {
    const samples = new Float32Array([0.8, -0.8, 0.4, 0]);
    const sampleRate = 24000;
    const audio = {sampleRate, length: samples.length, numberOfChannels: 1, getChannelData: () => samples};
    const padded = pronunciationWithLeadIn(audio, rate);
    const data = new DataView(padded);
    const leadingFrames = Math.ceil(sampleRate * PRONUNCIATION_LEAD_IN_MS * rate / 1000);
    expect(data.getUint32(24, true)).toBe(sampleRate);
    expect(data.getUint32(40, true)).toBe((leadingFrames + samples.length) * 2);
    for (let frame = 0; frame < leadingFrames; frame++) expect(data.getInt16(44 + frame * 2, true)).toBe(0);
    for (let frame = 0; frame < samples.length; frame++) {
      const restored = data.getInt16(44 + (leadingFrames + frame) * 2, true) / 32768;
      expect(restored).toBeCloseTo(samples[frame], 4);
    }
    expect(leadingFrames / sampleRate / rate).toBeCloseTo(0.4, 3);
  });

  it('preserves both channels and all speech frames without adding a gain ramp', () => {
    const channels = [new Float32Array([1, -1]), new Float32Array([0.5, -0.5])];
    const audio = {sampleRate: 1000, length: 2, numberOfChannels: 2, getChannelData: (channel: number) => channels[channel]};
    const data = new DataView(pronunciationWithLeadIn(audio, 1));
    expect(data.getUint16(22, true)).toBe(2);
    expect(data.getUint32(28, true)).toBe(4000);
    expect(data.getInt16(44 + 400 * 4, true)).toBe(32767);
    expect(data.getInt16(44 + 400 * 4 + 2, true)).toBe(16384);
    expect(data.getInt16(44 + 401 * 4, true)).toBe(-32768);
    expect(data.getInt16(44 + 401 * 4 + 2, true)).toBe(-16384);
  });
});
