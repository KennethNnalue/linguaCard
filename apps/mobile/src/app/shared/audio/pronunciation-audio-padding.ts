export const PRONUNCIATION_LEAD_IN_MS = 400;

export interface PronunciationPcm {
  sampleRate: number;
  length: number;
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

export function pronunciationWithLeadIn(audio: PronunciationPcm, rate: number): ArrayBuffer {
  const leadingFrames = Math.ceil(audio.sampleRate * PRONUNCIATION_LEAD_IN_MS * rate / 1000);
  const frames = leadingFrames + audio.length;
  const channels = audio.numberOfChannels;
  const bytesPerFrame = channels * 2;
  const buffer = new ArrayBuffer(44 + frames * bytesPerFrame);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index++) view.setUint8(offset + index, text.charCodeAt(index));
  };
  writeText(0, 'RIFF');
  view.setUint32(4, buffer.byteLength - 8, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * bytesPerFrame, true);
  view.setUint16(32, bytesPerFrame, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, frames * bytesPerFrame, true);
  for (let channel = 0; channel < channels; channel++) {
    const samples = audio.getChannelData(channel);
    for (let frame = 0; frame < audio.length; frame++) {
      const sample = Math.min(1, Math.max(-1, samples[frame]));
      const offset = 44 + ((leadingFrames + frame) * channels + channel) * 2;
      view.setInt16(offset, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
    }
  }
  return buffer;
}
