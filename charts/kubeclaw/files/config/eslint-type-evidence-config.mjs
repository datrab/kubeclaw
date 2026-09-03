// Canonical audit-only TypeScript evidence policy.
import tseslint from 'typescript-eslint';

import typeEvidence from './type-evidence-eslint-plugin.mjs';

const IGNORES = [
  '.git/**',
  '.swarm/**',
  '**/node_modules/**',
  '**/*.test.*',
  '**/*.spec.*',
  '**/test/**',
  '**/tests/**',
  '**/__tests__/**',
  '**/fixtures/**',
];

const TYPE_AWARE_DEFAULT_PROJECT = [
  'scripts/production-receipt-attestation.d.mts',
  'skills/buster/plugins/buster-suite-runtime/common/pipeline/runtime-state-paths.ts',
  'skills/buster/plugins/buster-suite-runtime/common/pipeline/timing.ts',
  'skills/buster/plugins/buster-suite-runtime/src/runtime/runtime-state-paths.ts',
  'skills/buster/plugins/buster-suite-runtime/src/runtime/services/buildkit.ts',
  'skills/buster/plugins/buster-suite-runtime/src/runtime/services/git-identity.ts',
  'skills/buster/plugins/buster-suite-runtime/src/runtime/services/git-push-policy.ts',
  'skills/buster/plugins/buster-suite-runtime/src/runtime/services/git-workflow-contracts.ts',
  'skills/buster/plugins/buster-suite-runtime/src/runtime/services/git-workflows.ts',
  'skills/buster/plugins/buster-suite-runtime/src/runtime/services/image-reference.ts',
  'skills/buster/plugins/buster-suite-runtime/src/runtime/services/resource-cleanup.ts',
  'skills/buster/plugins/buster-suite-runtime/src/runtime/timing.ts',
];

const PROJECT_OWNED_TYPE_AWARE_FILES = [
  'skills/common/plugin-runtime/**/*.{ts,tsx,mts,cts}',
  'skills/common/plugins/**/*.{ts,tsx,mts,cts}',
  'skills/nova/plugins/**/*.{ts,tsx,mts,cts}',
  'skills/buster/plugins/**/*.{ts,tsx,mts,cts}',
  'scripts/**/*.{ts,tsx,mts,cts}',
  'tests/verification/**/*.{ts,tsx,mts,cts}',
];

export default [
  { ignores: IGNORES },
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
    rules: { 'type-evidence/no-module-mocking': 'warn' },
  },
  // Syntax-level evidence rules cover every production TypeScript file.
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
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
  // Only this official rule requires TypeScript project ownership and type information.
  {
    files: PROJECT_OWNED_TYPE_AWARE_FILES,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: {
          allowDefaultProject: TYPE_AWARE_DEFAULT_PROJECT,
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 16,
        },
        tsconfigRootDir: process.cwd(),
      },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: { '@typescript-eslint/no-unsafe-type-assertion': 'warn' },
  },
];
