import { selectGenderedVoiceIds } from './elevenlabs-dialogue.adapter';

describe('ElevenLabs gendered voice selection', () => {
  const configured = { female: ['preferred-female'], male: [] };
  const discovered = [
    { id: 'female-b', gender: 'female' as const },
    { id: 'male-a', gender: 'male' as const },
  ];

  it('assigns voices matching every transcript speaker gender', () => {
    expect(selectGenderedVoiceIds(
      [{ gender: 'female', voiceId: '' }, { gender: 'male', voiceId: '' }],
      configured, discovered, () => 0,
    )).toEqual(['preferred-female', 'male-a']);
  });

  it('does not reuse one voice for two speakers', () => {
    expect(selectGenderedVoiceIds(
      [{ gender: 'male', voiceId: '' }, { gender: 'male', voiceId: '' }],
      configured, discovered,
    )).toBeNull();
  });

  it('varies voices when the approved pool has alternatives', () => {
    const speakers = [{ gender: 'female' as const, voiceId: '' }];
    expect(selectGenderedVoiceIds(speakers, {
      female: ['female-a', 'female-b'], male: [],
    }, [], () => 0)).toEqual(['female-a']);
    expect(selectGenderedVoiceIds(speakers, {
      female: ['female-a', 'female-b'], male: [],
    }, [], () => 1)).toEqual(['female-b']);
  });

  it('keeps an assigned voice on regeneration', () => {
    expect(selectGenderedVoiceIds(
      [{ gender: 'female', voiceId: 'female-b' }],
      { female: ['female-a', 'female-b'], male: [] }, [], () => 0,
    )).toEqual(['female-b']);
  });

  it('can recast two same-gender speakers by swapping their voices', () => {
    expect(selectGenderedVoiceIds(
      [{ gender: 'female', voiceId: '' }, { gender: 'female', voiceId: '' }],
      { female: ['female-a', 'female-b'], male: [] }, [], () => 0,
      ['female-a', 'female-b'],
    )).toEqual(['female-b', 'female-a']);
  });

  it('prefers a different voice from the previous episode', () => {
    expect(selectGenderedVoiceIds(
      [{ gender: 'female', voiceId: '' }],
      { female: ['female-a', 'female-b'], male: [] }, [], () => 0,
      ['female-a'],
    )).toEqual(['female-b']);
  });
});
