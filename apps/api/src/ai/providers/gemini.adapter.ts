import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import type { AITextRequest, AITextResponse } from './anthropic.adapter';

const MODEL = 'gemini-2.5-flash';

@Injectable()
export class GeminiAdapter {
  private readonly logger = new Logger(GeminiAdapter.name);
  private readonly ai: GoogleGenAI;

  constructor() {
    const key = process.env['GEMINI_API_KEY'] ?? '';
    this.logger.log(`Gemini key loaded: ${key ? key.substring(0, 10) + '...' : 'EMPTY'}`);
    this.ai = new GoogleGenAI({ apiKey: key });
  }

  async generateText(request: AITextRequest): Promise<AITextResponse> {
    const prompt = request.messages.map(m => m.content).join('\n\n');

    const response = await this.ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        maxOutputTokens: request.maxTokens ?? 8192,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    return {
      text: response.text ?? '',
      model: MODEL,
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }
}
