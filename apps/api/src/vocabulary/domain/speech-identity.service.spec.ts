import { describe, expect, it } from '@jest/globals';
import { SpeechIdentityService } from './speech-identity.service';

describe('SpeechIdentityService', () => {
  const service = new SpeechIdentityService();
  const base = {
    language: 'de-DE',
    text: 'Der Bahnhof.',
    voiceKey: 'german-hd-default',
    profileVersion: 1,
    contentKind: 'word' as const,
  };

  it('reuses an identity across harmless casing, whitespace, and trailing punctuation differences', () => {
    const first = service.createIdentity(base);
    const second = service.createIdentity({ ...base, text: '  der   bahnhof  ' });

    expect(first.identityKey).toBe(second.identityKey);
    expect(first.normalizedText).toBe('der bahnhof');
    expect(first.language).toBe('de');
  });

  it('changes identity when the voice or synthesis profile changes', () => {
    const original = service.createIdentity(base);
    const otherVoice = service.createIdentity({ ...base, voiceKey: 'german-hd-warm' });
    const otherProfile = service.createIdentity({ ...base, profileVersion: 2 });

    expect(new Set([
      original.identityKey,
      otherVoice.identityKey,
      otherProfile.identityKey,
    ]).size).toBe(3);
  });

  it('reuses audio across content roles when synthesis is otherwise identical', () => {
    const word = service.createIdentity(base);
    const example = service.createIdentity({ ...base, contentKind: 'example' });

    expect(word.identityKey).toBe(example.identityKey);
  });

  it('rejects an invalid profile version', () => {
    expect(() => service.createIdentity({ ...base, profileVersion: 0 }))
      .toThrow('Speech profile version must be a positive integer');
  });
});
