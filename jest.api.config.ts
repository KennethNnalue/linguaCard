import type { Config } from 'jest';

const config: Config = {
  preset: 'jest-preset-angular',
  roots: ['<rootDir>/apps/api', '<rootDir>/libs'],
  testEnvironment: 'node',
  testPathIgnorePatterns: [
    '/apps/api/src/ai/providers/google-cloud-tts.adapter.spec.ts$',
    '/apps/api/src/ai/providers/openrouter.adapter.spec.ts$',
    '/apps/api/src/stories/story-generation.service.spec.ts$',
    '/apps/api/src/subscriptions/subscription.service.spec.ts$',
    '/apps/api/src/word-audio/ssml-builder.spec.ts$',
  ],
  moduleNameMapper: {
    '@lingua-card/shared/domain': '<rootDir>/libs/shared/domain/src/index.ts',
    '@lingua-card/shared/dto': '<rootDir>/libs/shared/dto/src/index.ts',
    '@lingua-card/shared/utils': '<rootDir>/libs/shared/utils/src/index.ts',
    '@lingua-card/shared/testing': '<rootDir>/libs/shared/testing/src/index.ts',
  },
};

export default config;
