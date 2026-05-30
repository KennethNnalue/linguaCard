export const environment = {
  production: true,
  // Replaced at build time — set API_URL in the Vercel project environment variables
  apiUrl: '%%API_URL%%',
  ai: {
    defaultProvider: 'anthropic' as const,
    pronunciationEnabled: true,
    storyGenerationEnabled: true,
  },
};
