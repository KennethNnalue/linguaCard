export const environment = {
  production: false,
  apiUrl: 'https://linguacard-api-dev.onrender.com/api/v1',
  ai: {
    defaultProvider: 'anthropic' as const,
    pronunciationEnabled: true,
    storyGenerationEnabled: true,
  },
};
