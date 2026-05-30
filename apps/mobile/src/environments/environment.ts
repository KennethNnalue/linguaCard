export const environment = {
  production: false,
  apiUrl: 'http://localhost:3001/api/v1',
  ai: {
    defaultProvider: 'anthropic' as const,
    pronunciationEnabled: true,
    storyGenerationEnabled: true,
  },
};
