import { FlatCompat } from '@eslint/eslintrc';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const configDirectory = path.dirname(fileURLToPath(import.meta.url));
const compatibility = new FlatCompat({ baseDirectory: configDirectory });

export default [
  {
    ignores: [
      '.angular/**',
      'coverage/**',
      'dist/**',
      'node_modules/**',
      'out-tsc/**',
      'www/**',
    ],
  },
  ...compatibility.config({
    overrides: [
      {
        files: ['**/*.ts'],
        parserOptions: {
          project: ['./tsconfig.json'],
          createDefaultProgram: true,
        },
        extends: ['plugin:@typescript-eslint/recommended'],
      },
      {
        files: ['apps/mobile/**/*.ts'],
        parserOptions: {
          project: ['./tsconfig.json'],
          createDefaultProgram: true,
        },
        extends: [
          'plugin:@angular-eslint/recommended',
          'plugin:@angular-eslint/template/process-inline-templates',
        ],
        rules: {
          '@angular-eslint/component-class-suffix': [
            'error',
            { suffixes: ['Page', 'Component'] },
          ],
          '@angular-eslint/component-selector': [
            'error',
            { type: 'element', prefix: 'lc', style: 'kebab-case' },
          ],
          '@angular-eslint/directive-selector': [
            'error',
            { type: 'attribute', prefix: 'lc', style: 'camelCase' },
          ],
        },
      },
      {
        files: ['apps/mobile/**/*.html'],
        extends: ['plugin:@angular-eslint/template/recommended'],
      },
    ],
  }),
];
