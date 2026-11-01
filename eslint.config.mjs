import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/', '.atl/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['..', '../*'], message: 'Use @/... (maps to src/...)' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        { accessibility: 'explicit' },
      ],
    },
  },
  {
    files: [
      'src/**/domain/services/**/*.ts',
      'src/**/application/use-cases/**/*.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // Reports the second and later public methods.
          selector:
            "MethodDefinition[kind='method'][accessibility='public'] ~ MethodDefinition[kind='method'][accessibility='public']",
          message:
            'one-public-method: a domain service or use case has exactly one public method, run(). Make helpers private.',
        },
        {
          selector:
            "MethodDefinition[kind='method'] > FunctionExpression[params.length>1]",
          message:
            'params-object: a method with more than one parameter takes one params object typed by a named interface.',
        },
      ],
    },
  },
);
