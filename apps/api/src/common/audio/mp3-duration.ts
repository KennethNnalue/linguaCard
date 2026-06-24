/**
 * Compute the playback duration (ms) of an MP3 buffer by walking its frame
 * headers and summing each frame's sample duration.
 *
 * Why not estimate from byte length? Google Cloud TTS returns MP3 at a bitrate it
 * chooses (often variable), so `byteLength / (bitrate/8)` is unreliable and was the
 * cause of karaoke desync. Parsing real frame headers is accurate for both CBR and
 * VBR with no external dependency.
 *
 * Returns `null` when no valid MP3 frames are found, so callers can fall back.
 */

// MPEG audio version → samples-per-frame for Layer III.
// MPEG-1 = 1152 samples/frame; MPEG-2 / 2.5 = 576 samples/frame.
const SAMPLES_PER_FRAME_L3 = { mpeg1: 1152, mpeg2: 576 } as const;

// Bitrate tables (kbps) for Layer III, indexed by the 4-bit bitrate field.
// 0 = "free", 15 = "bad" — both treated as invalid.
const BITRATE_L3_MPEG1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const BITRATE_L3_MPEG2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

// Sample-rate tables (Hz), indexed by the 2-bit sample-rate field, per MPEG version.
const SAMPLE_RATE = {
  mpeg1:  [44100, 48000, 32000, 0],
  mpeg2:  [22050, 24000, 16000, 0],
  mpeg25: [11025, 12000, 8000, 0],
} as const;

/** Parse one MPEG Layer III frame header at `offset`; returns its size + duration. */
function parseFrame(
  buf: Buffer,
  offset: number,
): { frameLength: number; durationMs: number } | null {
  if (offset + 4 > buf.length) return null;

  const b1 = buf[offset];
  const b2 = buf[offset + 1];
  const b3 = buf[offset + 2];

  // Frame sync: 11 bits set (0xFFE).
  if (b1 !== 0xff || (b2 & 0xe0) !== 0xe0) return null;

  const versionBits = (b2 >> 3) & 0x03; // 00=MPEG2.5, 10=MPEG2, 11=MPEG1
  const layerBits   = (b2 >> 1) & 0x03; // 01 = Layer III
  if (layerBits !== 0x01) return null;   // only Layer III (MP3)
  if (versionBits === 0x01) return null; // reserved version

  const isMpeg1 = versionBits === 0x03;
  const bitrateIdx    = (b3 >> 4) & 0x0f;
  const sampleRateIdx = (b3 >> 2) & 0x03;
  const padding       = (b3 >> 1) & 0x01;

  const bitrateKbps = (isMpeg1 ? BITRATE_L3_MPEG1 : BITRATE_L3_MPEG2)[bitrateIdx];
  const sampleRate =
    versionBits === 0x03 ? SAMPLE_RATE.mpeg1[sampleRateIdx]
    : versionBits === 0x02 ? SAMPLE_RATE.mpeg2[sampleRateIdx]
    : SAMPLE_RATE.mpeg25[sampleRateIdx];

  if (!bitrateKbps || !sampleRate) return null;

  const samplesPerFrame = isMpeg1 ? SAMPLES_PER_FRAME_L3.mpeg1 : SAMPLES_PER_FRAME_L3.mpeg2;
  // Layer III frame length in bytes.
  const frameLength = Math.floor((samplesPerFrame / 8 * bitrateKbps * 1000) / sampleRate) + padding;
  if (frameLength <= 0) return null;

  return { frameLength, durationMs: (samplesPerFrame / sampleRate) * 1000 };
}

/** Skip an ID3v2 tag at the start of the buffer, if present. Returns the offset past it. */
function skipId3v2(buf: Buffer): number {
  if (buf.length >= 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    // ID3v2 size is a 28-bit synchsafe integer in bytes 6–9.
    const size =
      (buf[6] & 0x7f) * 0x200000 +
      (buf[7] & 0x7f) * 0x4000 +
      (buf[8] & 0x7f) * 0x80 +
      (buf[9] & 0x7f);
    return 10 + size;
  }
  return 0;
}

/**
 * Sum the durations of all MP3 frames in the buffer. Returns total ms, or `null`
 * if the buffer doesn't look like MP3 (no valid frames found).
 */
export function getMp3DurationMs(buf: Buffer): number | null {
  let offset = skipId3v2(buf);
  let totalMs = 0;
  let frames = 0;

  while (offset + 4 <= buf.length) {
    const frame = parseFrame(buf, offset);
    if (!frame) {
      // Not at a frame boundary — advance one byte to resync (cheap for our inputs).
      offset += 1;
      continue;
    }
    totalMs += frame.durationMs;
    frames += 1;
    offset += frame.frameLength;
  }

  return frames > 0 ? Math.round(totalMs) : null;
}
