import { cohortForUser, localListeningDate, readRecommendationContext } from './podcast-attribution';
describe('podcast attribution boundaries', () => {
  it('assigns the same account and experiment consistently with exact rollout boundaries', () => {
    expect(cohortForUser('a', 'v2', 30)).toBe(cohortForUser('a', 'v2', 30));
    expect(cohortForUser('a', 'v2', 0)).toBe('control');
    expect(cohortForUser('a', 'v2', 100)).toBe('treatment');
    expect(new Set(Array.from({ length: 100 }, (_, i) => cohortForUser(`${i}`, 'v2', 50))).size).toBe(2);
  });
  it('uses configured local dates around midnight, including timezone fallback', () => {
    const now = new Date('2026-10-04T00:30:00Z');
    expect(localListeningDate(now, 'America/New_York')).toBe('2026-10-03');
    expect(localListeningDate(now, 'Europe/Berlin')).toBe('2026-10-04');
    expect(localListeningDate(now, 'invalid')).toBe('2026-10-04');
  });
  it('does not accept partial client policy metadata as a validated exposure', () => {
    expect(readRecommendationContext({ placement: 'home', policyVersion: 'forged' })).toBeNull();
    expect(readRecommendationContext(null)).toBeNull();
  });
});
