import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import { OpenRouterAdapter } from './openrouter.adapter';

const MOCK_AI_CONFIG = {
  openrouterApiKey:      'sk-or-v1-test',
  openrouterVisionModel: 'google/gemma-4-26b-a4b-it:free',
  openrouterTextModel:   'google/gemma-4-26b-a4b-it:free',
};

function buildAdapter(): OpenRouterAdapter {
  const configService = {
    get: jest.fn().mockReturnValue(MOCK_AI_CONFIG),
  } as unknown as ConfigService;

  return new OpenRouterAdapter(configService);
}

function mockFetchOk(body: unknown): jest.SpyInstance {
  return jest.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok:      true,
    status:  200,
    headers: { get: () => null },
    json:    async () => body,
    text:    async () => JSON.stringify(body),
  } as unknown as Response);
}

function mockFetchStatus(status: number, headers: Record<string, string> = {}): jest.SpyInstance {
  return jest.spyOn(global, 'fetch').mockResolvedValue({
    ok:      false,
    status,
    headers: { get: (h: string) => headers[h] ?? null },
    json:    async () => ({}),
    text:    async () => '',
  } as unknown as Response);
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

describe('OpenRouterAdapter', () => {

  describe('generateVision()', () => {
    it('returns text from the first choice', async () => {
      const adapter = buildAdapter();
      mockFetchOk({ choices: [{ message: { content: 'hello' } }] });

      const result = await adapter.generateVision({
        imageBase64: 'abc123',
        mimeType:    'image/jpeg',
        prompt:      'describe',
      });

      expect(result).toBe('hello');
    });

    it('sends base64 image as data: URI in messages array', async () => {
      const adapter = buildAdapter();
      const spy = mockFetchOk({ choices: [{ message: { content: '' } }] });

      await adapter.generateVision({ imageBase64: 'XYZ', mimeType: 'image/png', prompt: 'p' });

      const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
      const imageContent = body.messages[0].content[0];
      expect(imageContent.type).toBe('image_url');
      expect(imageContent.image_url.url).toBe('data:image/png;base64,XYZ');
    });

    it('includes HTTP-Referer and X-Title headers', async () => {
      const adapter = buildAdapter();
      const spy = mockFetchOk({ choices: [{ message: { content: '' } }] });

      await adapter.generateVision({ imageBase64: 'a', mimeType: 'image/jpeg', prompt: 'p' });

      const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
      expect(headers['HTTP-Referer']).toBe('https://linguacard.app');
      expect(headers['X-Title']).toBe('LinguaCard');
    });

    it('retries up to 3 times on 429 before throwing', async () => {
      const adapter = buildAdapter();
      jest.useFakeTimers();

      const spy = jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce({ ok: false, status: 429, headers: { get: () => null }, text: async () => '' } as unknown as Response)
        .mockResolvedValueOnce({ ok: false, status: 429, headers: { get: () => null }, text: async () => '' } as unknown as Response)
        .mockResolvedValueOnce({ ok: false, status: 429, headers: { get: () => null }, text: async () => '' } as unknown as Response)
        .mockResolvedValueOnce({ ok: false, status: 429, headers: { get: () => null }, text: async () => '' } as unknown as Response);

      const promise = adapter.generateVision({ imageBase64: 'a', mimeType: 'image/jpeg', prompt: 'p' });

      // Advance timers for each retry delay
      await jest.runAllTimersAsync();

      await expect(promise).rejects.toThrow(HttpException);
      expect(spy).toHaveBeenCalledTimes(4); // initial + 3 retries

      jest.useRealTimers();
    });

    it('throws HttpException with TOO_MANY_REQUESTS after max retries', async () => {
      const adapter = buildAdapter();
      jest.useFakeTimers();

      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false, status: 429, headers: { get: () => null }, text: async () => '',
      } as unknown as Response);

      const promise = adapter.generateVision({ imageBase64: 'a', mimeType: 'image/jpeg', prompt: 'p' });
      await jest.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });

      jest.useRealTimers();
    });

    it('throws SERVICE_UNAVAILABLE on network error', async () => {
      const adapter = buildAdapter();
      jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      await expect(
        adapter.generateVision({ imageBase64: 'a', mimeType: 'image/jpeg', prompt: 'p' }),
      ).rejects.toMatchObject({ status: HttpStatus.SERVICE_UNAVAILABLE });
    });
  });

  describe('generateText()', () => {
    it('returns AITextResponse with provider openrouter in model field', async () => {
      const adapter = buildAdapter();
      mockFetchOk({
        model:   'google/gemma-4-26b-a4b-it:free',
        choices: [{ message: { content: 'generated text' } }],
        usage:   { prompt_tokens: 10, completion_tokens: 20 },
      });

      const response = await adapter.generateText({
        messages: [{ role: 'user', content: 'hello' }],
      });

      expect(response.text).toBe('generated text');
      expect(response.model).toBe('google/gemma-4-26b-a4b-it:free');
    });

    it('maps usage.prompt_tokens to inputTokens', async () => {
      const adapter = buildAdapter();
      mockFetchOk({
        choices: [{ message: { content: '' } }],
        usage:   { prompt_tokens: 42, completion_tokens: 0 },
      });

      const response = await adapter.generateText({ messages: [{ role: 'user', content: '' }] });
      expect(response.inputTokens).toBe(42);
    });

    it('maps usage.completion_tokens to outputTokens', async () => {
      const adapter = buildAdapter();
      mockFetchOk({
        choices: [{ message: { content: '' } }],
        usage:   { prompt_tokens: 0, completion_tokens: 99 },
      });

      const response = await adapter.generateText({ messages: [{ role: 'user', content: '' }] });
      expect(response.outputTokens).toBe(99);
    });
  });

  describe('callWithRetry()', () => {
    it('delays exponentially between retries (1s, 2s, 4s)', async () => {
      const adapter = buildAdapter();
      jest.useFakeTimers();
      const setSpy = jest.spyOn(global, 'setTimeout');

      jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce({ ok: false, status: 429, headers: { get: () => null }, text: async () => '' } as unknown as Response)
        .mockResolvedValueOnce({ ok: false, status: 429, headers: { get: () => null }, text: async () => '' } as unknown as Response)
        .mockResolvedValueOnce({ ok: false, status: 429, headers: { get: () => null }, text: async () => '' } as unknown as Response)
        .mockResolvedValueOnce({ ok: false, status: 429, headers: { get: () => null }, text: async () => '' } as unknown as Response);

      const promise = adapter.generateVision({ imageBase64: 'a', mimeType: 'image/jpeg', prompt: 'p' });
      await jest.runAllTimersAsync();
      await expect(promise).rejects.toThrow();

      // Extract only the retry delays (1000, 2000, 4000)
      const delays = setSpy.mock.calls
        .map(args => args[1] as number)
        .filter(d => d >= 1000);

      expect(delays[0]).toBe(1000);
      expect(delays[1]).toBe(2000);
      expect(delays[2]).toBe(4000);

      jest.useRealTimers();
    });

    it('respects Retry-After header when present', async () => {
      const adapter = buildAdapter();
      jest.useFakeTimers();
      const setSpy = jest.spyOn(global, 'setTimeout');

      jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce({ ok: false, status: 429, headers: { get: (h: string) => h === 'Retry-After' ? '30' : null }, text: async () => '' } as unknown as Response)
        .mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) } as unknown as Response);

      const promise = adapter.generateVision({ imageBase64: 'a', mimeType: 'image/jpeg', prompt: 'p' });
      await jest.runAllTimersAsync();
      await promise;

      const retryDelay = setSpy.mock.calls.find(args => (args[1] as number) === 30_000);
      expect(retryDelay).toBeDefined();

      jest.useRealTimers();
    });

    it('does not retry on 400 or 500 errors', async () => {
      const adapter = buildAdapter();
      const spy = jest.spyOn(global, 'fetch')
        .mockResolvedValue({ ok: false, status: 400, headers: { get: () => null }, text: async () => '' } as unknown as Response);

      await expect(
        adapter.generateVision({ imageBase64: 'a', mimeType: 'image/jpeg', prompt: 'p' }),
      ).rejects.toThrow(HttpException);

      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});
