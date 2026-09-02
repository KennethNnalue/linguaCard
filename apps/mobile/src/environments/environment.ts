export const environment = {
  production: false,
  storageNamespace: 'local-development',
  apiUrl: `http://${globalThis.location.hostname}:3001/api/v1`,
  ai: {
    defaultProvider: 'anthropic' as const,
    pronunciationEnabled: true,
    storyGenerationEnabled: true,
  },
};
