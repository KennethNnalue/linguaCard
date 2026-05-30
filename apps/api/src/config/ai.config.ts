export interface AiConfig {
  anthropicApiKey: string;
  openaiApiKey: string;
  geminiApiKey: string;
  defaultProvider: 'anthropic' | 'openai' | 'gemini';
  storageBucket: string;
}

export const aiConfig = (): { ai: AiConfig } => ({
  ai: {
    anthropicApiKey: process.env['ANTHROPIC_API_KEY'] ?? '',
    openaiApiKey: process.env['OPENAI_API_KEY'] ?? '',
    geminiApiKey: process.env['GEMINI_API_KEY'] ?? '',
    defaultProvider: (process.env['AI_DEFAULT_PROVIDER'] ?? 'gemini') as AiConfig['defaultProvider'],
    storageBucket: process.env['AI_STORAGE_BUCKET'] ?? 'lingua-card-audio-dev',
  },
});
