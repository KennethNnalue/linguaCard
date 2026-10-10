import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ElevenLabsDialogueAdapter } from './elevenlabs-dialogue.adapter';
import { selectGenderedVoiceIds, splitDialogueInputs, pcmToWav } from './elevenlabs-dialogue.adapter';

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
  it('reports an actionable credit limit without exposing arbitrary provider details', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
      detail: { code: 'quota_exceeded', message: 'Not enough credits' },
    }, { status: 401 }));
    const adapter = new ElevenLabsDialogueAdapter({ get: () => ({ elevenLabsApiKey: 'test' }) } as unknown as ConfigService);
    await expect(adapter.generate([{ text: 'Hallo', voiceId: 'host' }], 'de'))
      .rejects.toThrow('ElevenLabs credits are insufficient for this episode. Shorten the script or add credits, then retry.');
  });

});

describe('long dialogue generation', () => {
  afterEach(() => jest.restoreAllMocks());
  it('splits at turn boundaries while preserving speakers and rejects oversized turns', () => {
    const turns = [{ text: 'a'.repeat(1300), voiceId: 'female' }, { text: 'b'.repeat(800), voiceId: 'male' }];
    expect(splitDialogueInputs(turns)).toEqual([[turns[0]], [turns[1]]]);
    expect(() => splitDialogueInputs([{ text: 'a'.repeat(2001), voiceId: 'female' }])).toThrow();
    expect(() => splitDialogueInputs(Array.from({ length: 6 }, () => ({ text: 'a'.repeat(2000), voiceId: 'female' })))).toThrow();
  });
  it('joins PCM samples into one WAV and offsets timing and dialogue indices', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({
      audio_base64: Buffer.alloc(48_000).toString('base64'),
      alignment: { characters: ['a'], character_start_times_seconds: [0.1], character_end_times_seconds: [0.9] },
      voice_segments: [{ voice_id: 'host', start_time_seconds: 0.1, end_time_seconds: 0.9,
        character_start_index: 0, character_end_index: 1, dialogue_input_index: 0 }],
    }));
    const adapter = new ElevenLabsDialogueAdapter({ get: () => ({ elevenLabsApiKey: 'test' }) } as unknown as ConfigService);
    const result = await adapter.generate([{ text: 'a'.repeat(1300), voiceId: 'host' }, { text: 'b'.repeat(800), voiceId: 'guest' }], 'de');
    expect(fetchMock.mock.calls.map(call => String(call[0]))).toEqual([
      expect.stringContaining('output_format=pcm_24000'), expect.stringContaining('output_format=pcm_24000'),
    ]);
    expect(result.format).toBe('wav');
    expect(result.audio.subarray(0, 4).toString()).toBe('RIFF');
    expect(result.audio.readUInt32LE(40)).toBe(96_000);
    expect(result.alignment.characterStartTimesSeconds).toEqual([0.1, 1.1]);
    expect(result.voiceSegments[1]).toEqual(expect.objectContaining({ startTimeSeconds: 1.1, dialogueInputIndex: 1, characterStartIndex: 1 }));
    expect(pcmToWav(Buffer.alloc(4)).readUInt32LE(24)).toBe(24_000);
  });
});
