import { validate } from 'class-validator';
import { PodcastEventDto } from './podcast-event.dto';

describe('podcast telemetry boundary', () => {
  it('rejects a client attempting to claim server-authoritative completion', async () => {
    const event = Object.assign(new PodcastEventDto(), {
      eventId: '00000000-0000-4000-8000-000000000001', episodeId: '00000000-0000-4000-8000-000000000002', name: 'completed',
    });
    expect(await validate(event)).toEqual(expect.arrayContaining([expect.objectContaining({ property: 'name' })]));
  });
  it('accepts only bounded attribution without vocabulary payloads', async () => {
    const event = Object.assign(new PodcastEventDto(), {
      eventId: '00000000-0000-4000-8000-000000000001', episodeId: '00000000-0000-4000-8000-000000000002',
      name: 'recommendation_impression', placement: 'home', policyVersion: 'vocabulary-v1',
    });
    expect(await validate(event)).toEqual([]);
  });
});
