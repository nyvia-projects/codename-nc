// eslint-disable-next-line no-undef
module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'prettier',
  ],
  overrides: [
    {
      files: '**/*.test.*',
      rules: {
        '@typescript-eslint/no-unsafe-call': 'off',
      },
    },
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    tsconfigRootDir: '.',
    project: ['./tsconfig.json'],
  },
  plugins: ['@typescript-eslint'],
  root: true,
  rules: {
    'lines-around-comment': [
      'warn',
      {
        beforeBlockComment: true,
        beforeLineComment: true,
        allowBlockStart: true,
        allowBlockEnd: false,
        allowObjectStart: true,
        allowObjectEnd: false,
        allowArrayStart: true,
        allowArrayEnd: false,
      },
    ],
  },
};
