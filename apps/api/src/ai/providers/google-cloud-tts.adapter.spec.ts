/*
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleCloudTTSAdapter } from './google-cloud-tts.adapter';

const VALID_KEY_JSON = JSON.stringify({
  type: 'service_account',
  project_id: 'test-project',
  private_key_id: 'key-id',
  private_key: 'fake-key',
  client_email: 'test@test-project.iam.gserviceaccount.com',
  client_id: '123456789',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
});
const VALID_KEY_BASE64 = Buffer.from(VALID_KEY_JSON).toString('base64');

const mockSynthesizeSpeech = jest.fn();
const mockListVoices = jest.fn();

jest.mock('@google-cloud/text-to-speech', () => ({
  TextToSpeechClient: jest.fn().mockImplementation(() => ({
    synthesizeSpeech: mockSynthesizeSpeech,
    listVoices:       mockListVoices,
  })),
  protos: { google: { cloud: { texttospeech: { v1: {} } } } },
}));

function makeConfig(keyBase64: string, voice = 'de-DE-Neural2-B', language = 'de-DE'): ConfigService {
  return {
    get: jest.fn().mockReturnValue({ googleCloudTtsKeyBase64: keyBase64, googleCloudTtsVoice: voice, googleCloudTtsLanguage: language }),
  } as unknown as ConfigService;
}

describe('GoogleCloudTTSAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit()', () => {
    it('logs warning and stays unconfigured when key is empty', () => {
      const adapter = new GoogleCloudTTSAdapter(makeConfig(''));
      const warnSpy = jest.spyOn((adapter as any).logger, 'warn').mockImplementation(() => undefined);
      adapter.onModuleInit();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('GOOGLE_CLOUD_TTS_KEY_BASE64'));
      expect((adapter as any).isConfigured).toBe(false);
    });

    it('initialises TextToSpeechClient when valid base64 key is provided', () => {
      const adapter = new GoogleCloudTTSAdapter(makeConfig(VALID_KEY_BASE64));
      adapter.onModuleInit();
      expect((adapter as any).isConfigured).toBe(true);
      expect((adapter as any).client).toBeDefined();
    });

    it('logs error and stays unconfigured when key is malformed JSON', () => {
      const bad = Buffer.from('not-valid-json').toString('base64');
      const adapter = new GoogleCloudTTSAdapter(makeConfig(bad));
      const errorSpy = jest.spyOn((adapter as any).logger, 'error').mockImplementation(() => undefined);
      adapter.onModuleInit();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to parse'), expect.anything());
      expect((adapter as any).isConfigured).toBe(false);
    });

    it('logs error and stays unconfigured when voice name contains "gemini" — prevents free-tier bypass', () => {
      const adapter = new GoogleCloudTTSAdapter(makeConfig(VALID_KEY_BASE64, 'gemini-2.5-flash-tts'));
      const errorSpy = jest.spyOn((adapter as any).logger, 'error').mockImplementation(() => undefined);
      adapter.onModuleInit();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Gemini-family'));
      expect((adapter as any).isConfigured).toBe(false);
    });
  });

  describe('generateSpeech()', () => {
    function makeConfiguredAdapter(): GoogleCloudTTSAdapter {
      const adapter = new GoogleCloudTTSAdapter(makeConfig(VALID_KEY_BASE64));
      adapter.onModuleInit();
      return adapter;
    }

    const fakeAudio = Buffer.from('fake-mp3-bytes');
    const mockResponse = [{ audioContent: fakeAudio }];

    it('throws ServiceUnavailableException when not configured', async () => {
      const adapter = new GoogleCloudTTSAdapter(makeConfig(''));
      adapter.onModuleInit();
      await expect(adapter.generateSpeech({ text: 'Hallo' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('calls synthesizeSpeech with { text } input when ssml=false', async () => {
      mockSynthesizeSpeech.mockResolvedValue(mockResponse);
      const adapter = makeConfiguredAdapter();
      await adapter.generateSpeech({ text: 'der Hund', ssml: false });
      expect(mockSynthesizeSpeech).toHaveBeenCalledWith(
        expect.objectContaining({ input: { text: 'der Hund' } }),
      );
    });

    it('calls synthesizeSpeech with { ssml } input when ssml=true', async () => {
      mockSynthesizeSpeech.mockResolvedValue(mockResponse);
      const adapter = makeConfiguredAdapter();
      await adapter.generateSpeech({ text: '<speak>der Hund</speak>', ssml: true });
      expect(mockSynthesizeSpeech).toHaveBeenCalledWith(
        expect.objectContaining({ input: { ssml: '<speak>der Hund</speak>' } }),
      );
    });

    it('returns audioBuffer, durationMs, mimeType="audio/mpeg", characterCount', async () => {
      mockSynthesizeSpeech.mockResolvedValue(mockResponse);
      const adapter = makeConfiguredAdapter();
      const result = await adapter.generateSpeech({ text: 'Hallo' });
      expect(result.mimeType).toBe('audio/mpeg');
      expect(result.characterCount).toBe(5);
      expect(result.audioBuffer).toBeDefined();
      expect(typeof result.audioBuffer.byteLength).toBe('number');
      expect(typeof result.durationMs).toBe('number');
    });

    it('uses defaultVoice and defaultLanguage when not overridden', async () => {
      mockSynthesizeSpeech.mockResolvedValue(mockResponse);
      const adapter = makeConfiguredAdapter();
      await adapter.generateSpeech({ text: 'test' });
      expect(mockSynthesizeSpeech).toHaveBeenCalledWith(
        expect.objectContaining({
          voice: { languageCode: 'de-DE', name: 'de-DE-Neural2-B' },
        }),
      );
    });

    it('uses request.voice and request.language when provided', async () => {
      mockSynthesizeSpeech.mockResolvedValue(mockResponse);
      const adapter = makeConfiguredAdapter();
      await adapter.generateSpeech({ text: 'test', voice: 'de-DE-Neural2-A', language: 'en-US' });
      expect(mockSynthesizeSpeech).toHaveBeenCalledWith(
        expect.objectContaining({
          voice: { languageCode: 'en-US', name: 'de-DE-Neural2-A' },
        }),
      );
    });

    it('applies request.speed as speakingRate', async () => {
      mockSynthesizeSpeech.mockResolvedValue(mockResponse);
      const adapter = makeConfiguredAdapter();
      await adapter.generateSpeech({ text: 'test', speed: 0.8 });
      expect(mockSynthesizeSpeech).toHaveBeenCalledWith(
        expect.objectContaining({
          audioConfig: expect.objectContaining({ speakingRate: 0.8 }),
        }),
      );
    });

    it('throws ServiceUnavailableException when SDK returns no audioContent', async () => {
      mockSynthesizeSpeech.mockResolvedValue([{ audioContent: null }]);
      const adapter = makeConfiguredAdapter();
      await expect(adapter.generateSpeech({ text: 'test' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('ping()', () => {
    it('returns true when listVoices() resolves', async () => {
      mockListVoices.mockResolvedValue([]);
      const adapter = new GoogleCloudTTSAdapter(makeConfig(VALID_KEY_BASE64));
      adapter.onModuleInit();
      expect(await adapter.ping()).toBe(true);
    });

    it('returns false when not configured', async () => {
      const adapter = new GoogleCloudTTSAdapter(makeConfig(''));
      adapter.onModuleInit();
      expect(await adapter.ping()).toBe(false);
    });

    it('returns false when listVoices() throws', async () => {
      mockListVoices.mockRejectedValue(new Error('network error'));
      const adapter = new GoogleCloudTTSAdapter(makeConfig(VALID_KEY_BASE64));
      adapter.onModuleInit();
      expect(await adapter.ping()).toBe(false);
    });
  });
});
*/
