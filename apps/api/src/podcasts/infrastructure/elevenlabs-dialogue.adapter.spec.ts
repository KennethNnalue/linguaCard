import { describe, expect, it } from '@jest/globals';
import { selectGenderedVoiceIds } from './elevenlabs-dialogue.adapter';

describe('ElevenLabs gendered voice selection', () => {
  const configured = { female: ['preferred-female'], male: [] };
  const discovered = [
    { id: 'female-b', gender: 'female' as const },
    { id: 'male-a', gender: 'male' as const },
  ];

  it('assigns voices matching every transcript speaker gender', () => {
    expect(selectGenderedVoiceIds(
      ['female', 'male'], configured, discovered,
    )).toEqual(['preferred-female', 'male-a']);
  });

  it('does not reuse one voice for two speakers', () => {
    expect(selectGenderedVoiceIds(
      ['male', 'male'], configured, discovered,
    )).toBeNull();
  });
});
