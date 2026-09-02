export const environment = {
  production: true,
  storageNamespace: 'production',
  // Replaced at build time — set API_URL in the Vercel project environment variables
  apiUrl: 'https://linguacard-api.onrender.com/api/v1',
  ai: {
    defaultProvider: 'anthropic' as const,
    pronunciationEnabled: true,
    storyGenerationEnabled: true,
  },
};
