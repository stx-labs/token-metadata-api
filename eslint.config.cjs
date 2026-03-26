const { FlatCompat } = require('@eslint/eslintrc');

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

module.exports = [
  ...compat.config({
    extends: ['@stacks/eslint-config', 'prettier'],
    parser: '@typescript-eslint/parser',
    parserOptions: {
      tsconfigRootDir: __dirname,
      project: './tsconfig.json',
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    ignorePatterns: [
      '*.config.js',
      'config/*',
      '*.mjs',
      'tests/**/*.js',
      'client/*',
      'coverage/*',
      'dist/*',
      'node_modules/',
    ],
    plugins: ['@typescript-eslint', 'eslint-plugin-tsdoc', 'prettier'],
    rules: {
      'prettier/prettier': 'error',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/camelcase': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-use-before-define': ['error', 'nofunc'],
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
      'no-warning-comments': 'warn',
      'tsdoc/syntax': 'error',
      // TODO: Remove this when `any` abi type is fixed.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  }),
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    },
  },
];
