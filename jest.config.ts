import type { Config } from 'jest';

const config: Config = {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$|@angular/common/locales/.*\\.js$|@ionic|@capacitor|ionicons|@stencil))',
  ],
  moduleNameMapper: {
    'ionicons/components/(.*)': '<rootDir>/node_modules/ionicons/components/$1',
  },
};

export default config;
