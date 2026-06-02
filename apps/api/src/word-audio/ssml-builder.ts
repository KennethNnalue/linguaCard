/**
 * Builds SSML markup for German vocabulary learning.
 * Rate 0.85 for short words lets learners catch each phoneme clearly.
 * Rate 0.90 for longer phrases avoids over-slowing connected speech.
 */
export function buildWordSsml(displayText: string): string {
  const wordCount = displayText.trim().split(/\s+/).length;
  const rate = wordCount <= 4 ? '0.85' : '0.90';
  return `<speak><prosody rate="${rate}">${escapeXml(displayText)}</prosody></speak>`;
}

/**
 * Builds SSML for story narration.
 * Rate 0.92 aids B1/B2 comprehension without sounding unnatural.
 */
export function buildStorySsml(storyText: string): string {
  return `<speak><prosody rate="0.92">${escapeXml(storyText)}</prosody></speak>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;');
}
