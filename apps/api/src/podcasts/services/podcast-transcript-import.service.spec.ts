import { describe, expect, it } from '@jest/globals';
import type { PodcastTranscriptPayloadDto } from '../dto/admin-podcast.dto';
import {
  estimatePodcastDuration, podcastTranscriptFingerprint,
} from './podcast-transcript-import.service';

const episodeMetadata = {
  title: 'Und was hast du gemacht?',
  titleTranslation: 'And what did you do?',
  description: 'Two people discuss work, study, and recent life events.',
};

const payload: PodcastTranscriptPayloadDto = {
  schemaVersion: 1,
  episode: episodeMetadata,
  speakers: [{ key: 'guest', name: 'Mia', voiceGender: 'female', voiceId: 'voice-1' }],
  turns: [{
    speakerKey: 'guest', targetText: 'Können wir getrennt bezahlen?',
    translation: 'Can we pay separately?', vocabularyRefs: ['getrennt-bezahlen'],
  }],
  vocabulary: [{
    key: 'getrennt-bezahlen', text: 'getrennt bezahlen',
    translation: 'to pay separately', importance: 'essential',
  }],
};

describe('podcast transcript import helpers', () => {
  it('creates a stable SHA-256 fingerprint for identical content', () => {
    expect(podcastTranscriptFingerprint(payload)).toMatch(/^[a-f0-9]{64}$/);
    expect(podcastTranscriptFingerprint({
      ...payload,
      speakers: payload.speakers.map(speaker => ({ ...speaker })),
      turns: payload.turns.map(turn => ({ ...turn, vocabularyRefs: [...turn.vocabularyRefs] })),
      vocabulary: payload.vocabulary.map(item => ({ ...item })),
    }))
      .toBe(podcastTranscriptFingerprint(payload));
  });

  it('changes the fingerprint when derived episode metadata changes', () => {
    expect(podcastTranscriptFingerprint({
      ...payload,
      episode: { ...episodeMetadata, title: 'Was hast du gemacht?' },
    })).not.toBe(podcastTranscriptFingerprint(payload));
  });

  it('estimates speaking duration from target-language words', () => {
    expect(estimatePodcastDuration(payload)).toBe(1846);
  });
});
