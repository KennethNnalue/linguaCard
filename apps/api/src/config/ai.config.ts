export interface AiConfig {
  anthropicApiKey: string;
  openaiApiKey: string;
  geminiApiKey: string;
  openrouterApiKey: string;
  openrouterVisionModel: string;
  openrouterTextModel: string;
  groqApiKey: string;
  defaultProvider: 'anthropic' | 'openai' | 'gemini' | 'openrouter';
  storageBucket: string;
}

export const aiConfig = (): { ai: AiConfig } => ({
  ai: {
    anthropicApiKey:      process.env['ANTHROPIC_API_KEY']        ?? '',
    openaiApiKey:         process.env['OPENAI_API_KEY']           ?? '',
    geminiApiKey:         process.env['GEMINI_API_KEY']           ?? '',
    openrouterApiKey:     process.env['OPENROUTER_API_KEY']       ?? '',
    openrouterVisionModel: process.env['OPENROUTER_VISION_MODEL'] ?? 'google/gemma-4-26b-a4b-it:free',
    openrouterTextModel:   process.env['OPENROUTER_TEXT_MODEL']   ?? 'google/gemma-4-26b-a4b-it:free',
    groqApiKey:           process.env['GROQ_API_KEY']             ?? '',
    defaultProvider: (process.env['AI_DEFAULT_PROVIDER'] ?? 'gemini') as AiConfig['defaultProvider'],
    storageBucket:        process.env['AI_STORAGE_BUCKET']        ?? 'lingua-card-audio-dev',
  },
});
