import type { Config } from 'jest';

const config: Config = {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  roots: ['<rootDir>/apps', '<rootDir>/libs'],
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
};

export default config;
