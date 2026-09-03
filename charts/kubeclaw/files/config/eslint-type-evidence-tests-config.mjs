// Canonical audit-only TypeScript evidence policy for test and fixture code.
import tseslint from 'typescript-eslint';

import typeEvidence from './type-evidence-eslint-plugin.mjs';

const TEST_FILES = [
  '**/*.test.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
  '**/*.spec.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
  '**/test/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
  '**/tests/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
  '**/__tests__/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
  '**/fixtures/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
];
const TEST_TYPESCRIPT_FILES = TEST_FILES.map((pattern) => pattern.replace('{js,jsx,ts,tsx,mjs,cjs,mts,cts}', '{ts,tsx,mts,cts}'));

export default [
  { ignores: ['.git/**', '.swarm/**', '**/node_modules/**'] },
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  {
    files: TEST_FILES,
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'type-evidence': typeEvidence },
    rules: { 'type-evidence/no-module-mocking': 'warn' },
  },
  {
    files: TEST_TYPESCRIPT_FILES,
    plugins: { 'type-evidence': typeEvidence },
    rules: {
      'type-evidence/no-chained-type-assertions': 'warn',
      'type-evidence/no-known-value-widening': 'warn',
      'type-evidence/no-object-parameters': 'warn',
      'type-evidence/no-unknown-returns': 'warn',
      'type-evidence/no-unknown-type-aliases': 'warn',
      'type-evidence/no-widen-then-assert': 'warn',
    },
  },
];
