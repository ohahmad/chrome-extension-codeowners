/* eslint-env node */
module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/strict-type-checked',
    'plugin:@typescript-eslint/stylistic-type-checked',
    'prettier'
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'prettier'],
  root: true,
  rules: {
    '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
    'prettier/prettier': 2 // Means error
  },
  parserOptions: {
    project: true,
    tsconfigRootDir: __dirname
  }
};
