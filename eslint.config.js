import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-harness/**',
      '**/coverage/**',
      'apps/desktop/src-tauri/**',
      'playwright-report/**',
      'test-results/**',
      'spikes/**',
      // Design references (HTML prototypes and their generated runtime), not app code.
      'docs/design/**',
      // Vendored as published (packages/speech/src/speak-line/vendor/headtts/README.md).
      'packages/*/src/**/vendor/**',
      // Fetched by the speech scripts for the browser tests (git ignores them too).
      'packages/speech/browser/harness/public/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/studio/**/*.{ts,tsx}', 'packages/{blocks,tiles}/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
