import type { AIProviderType, WordTimestamp } from '@lingua-card/shared/domain';

export interface AITextRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
}

export interface AITextResponse {
  text: string;
  provider: AIProviderType;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AISpeechRequest {
  text: string;
  voice?: string;
  speed?: number;
  language?: string;
}

export interface AISpeechResponse {
  audioBuffer: ArrayBuffer;
  durationMs: number;
}

export interface AIProvider {
  readonly name: AIProviderType;
  generateText(request: AITextRequest): Promise<AITextResponse>;
  generateSpeech(request: AISpeechRequest): Promise<AISpeechResponse>;
  transcribeWithTimestamps(audioBuffer: ArrayBuffer): Promise<WordTimestamp[]>;
}
