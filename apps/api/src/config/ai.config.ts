export interface AiConfig {
  anthropicApiKey:         string;
  openaiApiKey:            string;
  geminiApiKey:            string;
  openrouterApiKey:        string;
  openrouterVisionModel:   string;
  openrouterTextModel:     string;
  // Per-task model routing — override individually without touching other tasks
  enrichmentModel:         string;   // POST /import/enrich
  storyModelPro:           string;   // POST /stories/generate — Pro tier
  storyModelFree:          string;   // POST /stories/generate — Free tier
  groqApiKey:              string;
  defaultProvider:         'anthropic' | 'openai' | 'gemini' | 'openrouter';
  storageBucket:           string;
  googleCloudTtsKeyBase64: string;
  googleCloudTtsVoice:     string;
  googleCloudTtsLanguage:  string;
  elevenLabsApiKey:       string;
  elevenLabsDialogueModel: string;
  elevenLabsFemaleVoiceIds: string[];
  elevenLabsMaleVoiceIds: string[];
}

function defaultProvider(value: string | undefined): AiConfig['defaultProvider'] {
  return value === 'anthropic' || value === 'openai' || value === 'gemini' || value === 'openrouter'
    ? value
    : 'gemini';
}

export const aiConfig = (): { ai: AiConfig } => ({
  ai: {
    anthropicApiKey:      process.env['ANTHROPIC_API_KEY']        ?? '',
    openaiApiKey:         process.env['OPENAI_API_KEY']           ?? '',
    geminiApiKey:         process.env['GEMINI_API_KEY']           ?? '',
    openrouterApiKey:     process.env['OPENROUTER_API_KEY']       ?? '',
    openrouterVisionModel: process.env['OPENROUTER_VISION_MODEL'] ?? 'google/gemma-4-26b-a4b-it:free',
    openrouterTextModel:   process.env['OPENROUTER_TEXT_MODEL']   ?? 'google/gemma-4-26b-a4b-it:free',
    enrichmentModel:  process.env['ENRICHMENT_MODEL']  ?? 'anthropic/claude-haiku-4-5',
    storyModelPro:    process.env['STORY_MODEL_PRO']   ?? 'anthropic/claude-sonnet-4-6',
    storyModelFree:   process.env['STORY_MODEL_FREE']  ?? 'google/gemini-2.5-flash',
    groqApiKey:           process.env['GROQ_API_KEY']             ?? '',
    defaultProvider: defaultProvider(process.env['AI_DEFAULT_PROVIDER']),
    storageBucket:        process.env['AI_STORAGE_BUCKET']        ?? 'lingua-card-audio-dev',
    googleCloudTtsKeyBase64: process.env['GOOGLE_CLOUD_TTS_KEY_BASE64'] ?? '',
    googleCloudTtsVoice:     process.env['GOOGLE_CLOUD_TTS_VOICE']      ?? 'de-DE-Chirp3-HD-Charon',
    googleCloudTtsLanguage:  process.env['GOOGLE_CLOUD_TTS_LANGUAGE']   ?? 'de-DE',
    elevenLabsApiKey:        process.env['ELEVENLABS_API_KEY']          ?? '',
    elevenLabsDialogueModel: process.env['ELEVENLABS_DIALOGUE_MODEL']   ?? 'eleven_v3',
    elevenLabsFemaleVoiceIds: (process.env['ELEVENLABS_FEMALE_VOICE_IDS'] ?? '')
      .split(',').map(value => value.trim()).filter(Boolean),
    elevenLabsMaleVoiceIds: (process.env['ELEVENLABS_MALE_VOICE_IDS'] ?? '')
      .split(',').map(value => value.trim()).filter(Boolean),
  },
});
