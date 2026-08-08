/* eslint-env node */

// Emoji ranges via surrogate pairs (esquery regexes cannot take the `u` flag).
// Covers U+2600–27BF, U+FE0F, U+1F000–1FAFF (D83C/D83D/D83E pairs).
const EMOJI = '[\\u2600-\\u27BF\\uFE0F\\u2B00-\\u2BFF]|\\uD83C[\\uDC00-\\uDFFF]|\\uD83D[\\uDC00-\\uDFFF]|\\uD83E[\\uDD00-\\uDFFF]';

module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended'
  ],
  ignorePatterns: [
    'dist',
    'dev-dist',
    'node_modules',
    'coverage',
    'playwright-report',
    'test-results',
    'supabase/functions', // Deno runtime — not lintable with browser/node config
    '.eslintrc.cjs'
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
  },
  overrides: [
    {
      // BUILD.md §2.3 + §2.7 hard bans, enforced at lint time for all app code
      files: ['src/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector:
              "MemberExpression[object.property.name='serviceWorker'][property.name='register']",
            message:
              'Manual service-worker registration is banned; vite-plugin-pwa handles it (BUILD.md §2.3).'
          },
          {
            selector: `JSXText[value=/${EMOJI}/]`,
            message: 'No emojis in UI text (BUILD.md §2.7).'
          },
          {
            selector: `Literal[value=/${EMOJI}/]`,
            message: 'No emojis in string literals (BUILD.md §2.7).'
          },
          {
            selector: `TemplateElement[value.raw=/${EMOJI}/]`,
            message: 'No emojis in template strings (BUILD.md §2.7).'
          }
        ]
      }
    },
    {
      files: ['src/__tests__/**/*'],
      env: { node: true },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off'
      }
    }
  ]
};
