// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  // Base configurations
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  eslintConfigPrettier,

  // TypeScript parser options
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Strict code quality rules
  {
    rules: {
      // ═══════════════════════════════════════════════════════════════════════
      // COMPLEXITY RULES - Keep code readable for humans and LLMs
      // ⚠️ DO NOT MODIFY THESE LIMITS - Refactor code instead of changing rules
      // ═══════════════════════════════════════════════════════════════════════

      // Max 200 lines per file - keeps files small and LLM-friendly
      'max-lines': ['error', { max: 200, skipBlankLines: true, skipComments: true }],

      // Max 60 lines per function - allows for async/try-catch blocks
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],

      // Max 4 levels of nesting - allows for necessary try-catch in loops
      'max-depth': ['error', 4],

      // Max 5 parameters per function - for merge functions that need context
      'max-params': ['error', 5],

      // Max 20 statements per function
      'max-statements': ['error', 20],

      // Cyclomatic complexity limit (relaxed for sync logic)
      'complexity': ['error', 15],

      // ═══════════════════════════════════════════════════════════════════════
      // CODE STYLE - Consistency and clarity
      // ═══════════════════════════════════════════════════════════════════════

      // Require explicit return types on functions
      '@typescript-eslint/explicit-function-return-type': ['error', {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
        allowHigherOrderFunctions: true,
      }],

      // Require explicit accessibility modifiers
      '@typescript-eslint/explicit-member-accessibility': ['error', {
        accessibility: 'explicit',
        overrides: { constructors: 'no-public' },
      }],

      // Naming conventions (relaxed for external API types and plugin exports)
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'] },
        // Allow PascalCase for exported variables (like plugin exports that act as classes)
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
        { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['UPPER_CASE', 'PascalCase'] },
        // Allow snake_case for properties to match external APIs (GitHub, etc.)
        { selector: 'property', format: ['camelCase', 'UPPER_CASE', 'snake_case'], leadingUnderscore: 'allow' },
        { selector: 'typeProperty', format: ['camelCase', 'UPPER_CASE', 'snake_case'], leadingUnderscore: 'allow' },
        // Allow HTTP headers and plugin hook names (like 'tool.execute.after')
        { selector: 'objectLiteralProperty', format: null },
        // Allow method names with dots for plugin hooks
        { selector: 'objectLiteralMethod', format: null },
      ],

      // Prefer const over let when possible
      'prefer-const': 'error',

      // No var, only const and let
      'no-var': 'error',

      // Use strict equality
      'eqeqeq': ['error', 'always'],

      // ═══════════════════════════════════════════════════════════════════════
      // ERROR PREVENTION - Catch bugs early
      // ═══════════════════════════════════════════════════════════════════════

      // No unused variables
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],

      // No floating promises (must await or handle)
      '@typescript-eslint/no-floating-promises': 'error',

      // No misused promises
      '@typescript-eslint/no-misused-promises': 'error',

      // Require await in async functions
      '@typescript-eslint/require-await': 'error',

      // No unsafe any usage
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',

      // No explicit any
      '@typescript-eslint/no-explicit-any': 'error',

      // ═══════════════════════════════════════════════════════════════════════
      // BEST PRACTICES
      // ═══════════════════════════════════════════════════════════════════════

      // Prefer nullish coalescing
      '@typescript-eslint/prefer-nullish-coalescing': 'error',

      // Prefer optional chaining
      '@typescript-eslint/prefer-optional-chain': 'error',

      // No non-null assertions
      '@typescript-eslint/no-non-null-assertion': 'error',

      // Consistent type imports
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        fixStyle: 'separate-type-imports',
      }],

      // Consistent type exports
      '@typescript-eslint/consistent-type-exports': 'error',

      // No console in production code (use proper logging)
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // ═══════════════════════════════════════════════════════════════════════
      // DOCUMENTATION
      // ═══════════════════════════════════════════════════════════════════════

      // Require JSDoc for exported functions
      // Commented out - can be too strict for rapid development
      // 'jsdoc/require-jsdoc': ['warn', { publicOnly: true }],
    },
  },

  // Ignore patterns
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '*.js',
      '*.mjs',
      'eslint.config.js',
    ],
  }
);
