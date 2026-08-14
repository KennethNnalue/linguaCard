import type { Config } from 'jest';

const config: Config = {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  roots: ['<rootDir>/apps', '<rootDir>/libs'],
  testPathIgnorePatterns: [
    '/apps/api/src/ai/providers/google-cloud-tts.adapter.spec.ts$',
    '/apps/api/src/ai/providers/openrouter.adapter.spec.ts$',
    '/apps/api/src/stories/story-generation.service.spec.ts$',
    '/apps/api/src/subscriptions/subscription.service.spec.ts$',
    '/apps/api/src/word-audio/ssml-builder.spec.ts$',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$|@angular/common/locales/.*\\.js$|@ionic|@capacitor|ionicons|@stencil))',
  ],
  moduleNameMapper: {
    'ionicons/components/(.*)': '<rootDir>/node_modules/ionicons/components/$1',
    '@lingua-card/shared/domain': '<rootDir>/libs/shared/domain/src/index.ts',
    '@lingua-card/shared/dto': '<rootDir>/libs/shared/dto/src/index.ts',
    '@lingua-card/shared/utils': '<rootDir>/libs/shared/utils/src/index.ts',
    '@lingua-card/shared/testing': '<rootDir>/libs/shared/testing/src/index.ts',
  },
  testEnvironment: 'jsdom',
};

export default config;
