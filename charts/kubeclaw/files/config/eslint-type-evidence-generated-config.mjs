// Audit-only syntax rules for generated and otherwise untracked repository files.
import tseslint from 'typescript-eslint';

import typeEvidence from './type-evidence-eslint-plugin.mjs';

export default [
  { ignores: ['.git/**', '.swarm/**', '**/node_modules/**'] },
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  {
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'type-evidence': typeEvidence },
    rules: {
      'type-evidence/no-module-mocking': 'warn',
      'type-evidence/no-chained-type-assertions': 'warn',
      'type-evidence/no-known-value-widening': 'warn',
      'type-evidence/no-object-parameters': 'warn',
      'type-evidence/no-unknown-returns': 'warn',
      'type-evidence/no-unknown-type-aliases': 'warn',
      'type-evidence/no-widen-then-assert': 'warn',
    },
  },
];
