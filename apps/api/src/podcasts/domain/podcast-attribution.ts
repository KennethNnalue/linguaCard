import { createHash } from 'node:crypto';
import type { PodcastPlaybackRange, PodcastRecommendationContext } from '@lingua-card/shared/domain';

export function cohortForUser(userId: string, version: string, percent: number): 'treatment' | 'control' {
  const bucket = createHash('sha256').update(`${version}:${userId}`).digest().readUInt32BE(0) % 10000;
  return bucket < Math.max(0, Math.min(100, percent)) * 100 ? 'treatment' : 'control';
}
export function localListeningDate(now: Date, timezone: string): string {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
  catch { return now.toISOString().slice(0, 10); }
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function readRecommendationContext(value: unknown): PodcastRecommendationContext | null {
  if (!isRecord(value)) return null;
  const { recommendationId, episodeId, audioVersion, placement, policyVersion, discoveryLevel,
    targetLanguage, sourceLanguage, experimentVersion, cohort } = value;
  if (typeof recommendationId !== 'string' || typeof episodeId !== 'string' || typeof audioVersion !== 'number'
    || !Number.isInteger(audioVersion) || audioVersion < 1 || typeof policyVersion !== 'string'
    || typeof targetLanguage !== 'string' || typeof sourceLanguage !== 'string' || typeof experimentVersion !== 'string'
    || (cohort !== 'treatment' && cohort !== 'control')
    || (placement !== 'home' && placement !== 'review_summary' && placement !== 'library')
    || (discoveryLevel !== 'all' && discoveryLevel !== 'A1' && discoveryLevel !== 'A2' && discoveryLevel !== 'B1'
      && discoveryLevel !== 'B2' && discoveryLevel !== 'C1')) return null;
  return { recommendationId, episodeId, audioVersion, placement, policyVersion, discoveryLevel,
    targetLanguage, sourceLanguage, experimentVersion, cohort,
    ...(typeof value['learningContextId'] === 'string' ? { learningContextId: value['learningContextId'] } : {}) };
}
export function readPlaybackRanges(value: unknown): PodcastPlaybackRange[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => isRecord(item) && typeof item['startMs'] === 'number' && typeof item['endMs'] === 'number'
    ? [{ startMs: item['startMs'], endMs: item['endMs'] }] : []);
}
