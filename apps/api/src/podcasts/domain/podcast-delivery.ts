import type { PodcastAudioTag } from '@lingua-card/shared/domain';

/** Only provider input contains stage directions; subtitles and alignment stay clean. */
export function podcastDeliveryText(turn: { targetText: string; audioTags?: readonly PodcastAudioTag[] }): string {
  const cues = (turn.audioTags ?? []).map(tag => `[${tag}]`).join(' ');
  return cues ? `${cues} ${turn.targetText}` : turn.targetText;
}
