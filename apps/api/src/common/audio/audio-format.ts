/**
 * Map an audio MIME type to its canonical file extension and Content-Type.
 *
 * Why this exists: Google Cloud TTS reports MP3 audio as `audio/mpeg` (not
 * `audio/mp3`), so a naive `mimeType.includes('mp3')` check misclassifies it as
 * WAV — the audio is genuine MP3 but gets saved/served as `.wav` with an
 * `audio/wav` Content-Type. Browsers sniff the real bytes so playback still works,
 * but the metadata is wrong (and would mislabel files sent to Whisper).
 *
 * Treat both `mpeg` and `mp3` as MP3; everything else (Gemini TTS returns
 * `audio/wav`) falls back to WAV.
 */
export function isMp3MimeType(mimeType: string): boolean {
  const m = mimeType.toLowerCase();
  return m.includes('mpeg') || m.includes('mp3');
}

/** Canonical file extension (no dot) for the given audio MIME type. */
export function audioExtFor(mimeType: string): 'mp3' | 'wav' {
  return isMp3MimeType(mimeType) ? 'mp3' : 'wav';
}

/** Canonical Content-Type for the given audio MIME type. */
export function audioContentTypeFor(mimeType: string): 'audio/mpeg' | 'audio/wav' {
  return isMp3MimeType(mimeType) ? 'audio/mpeg' : 'audio/wav';
}
