import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ElevenLabsDialogueAdapter } from './elevenlabs-dialogue.adapter';
import { selectGenderedVoiceIds } from './elevenlabs-dialogue.adapter';

describe('ElevenLabs voice discovery', () => {
  afterEach(() => jest.restoreAllMocks());

  it('includes available default voices without requiring a native-language label', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = new URL(String(input));
      const voices = url.searchParams.has('voice_type') || url.searchParams.has('language')
        ? []
        : [
          { voice_id: 'female-default', labels: { gender: 'female', language: 'en' } },
          { voice_id: 'male-default', labels: { gender: 'male', language: 'en' } },
        ];
      return Response.json({ voices, has_more: false });
    });
    const module = await Test.createTestingModule({
      providers: [
        ElevenLabsDialogueAdapter,
        { provide: ConfigService, useValue: { get: () => ({ elevenLabsApiKey: 'test-key' }) } },
      ],
    }).compile();
    const adapter = module.get(ElevenLabsDialogueAdapter);

    await expect(adapter.resolveVoiceIds([
      { gender: 'female', voiceId: '' },
      { gender: 'male', voiceId: '' },
    ], 'de', ['old-female', 'old-male'])).resolves.toEqual(['female-default', 'male-default']);
  });

  it('reports a voice-pool conflict when the account has no matching voices', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ voices: [], has_more: false }));
    const module = await Test.createTestingModule({
      providers: [
        ElevenLabsDialogueAdapter,
        { provide: ConfigService, useValue: { get: () => ({ elevenLabsApiKey: 'test-key' }) } },
      ],
    }).compile();
    const adapter = module.get(ElevenLabsDialogueAdapter);

    await expect(adapter.resolveVoiceIds([{ gender: 'female', voiceId: '' }], 'de'))
      .rejects.toBeInstanceOf(ConflictException);
  });
});

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


describe('Eleven v4 dialogue request', () => {
  afterEach(() => jest.restoreAllMocks());
  it('uses v4 and dialogue settings while preserving cues and language', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
      audio_base64: Buffer.from('audio').toString('base64'),
      alignment: { characters: ['H'], character_start_times_seconds: [0], character_end_times_seconds: [1] },
      voice_segments: [{ voice_id: 'host', start_time_seconds: 0, end_time_seconds: 1,
        character_start_index: 0, character_end_index: 1, dialogue_input_index: 0 }],
    }));
    const adapter = new ElevenLabsDialogueAdapter({ get: () => ({
      elevenLabsApiKey: 'test', elevenLabsDialogueStability: 0.5, elevenLabsDialogueSimilarity: 0.8,
    }) } as unknown as ConfigService);
    await adapter.generate([{ text: '[warm] Hallo!', voiceId: 'host' }], 'de');
    const init = fetchMock.mock.calls[0][1];
    expect(JSON.parse(String(init?.body))).toEqual(expect.objectContaining({
      model_id: 'eleven_v4', language_code: 'de', settings: { stability: 0.5, similarity: 0.8 },
      inputs: [{ text: '[warm] Hallo!', voice_id: 'host' }],
    }));
  });
});
