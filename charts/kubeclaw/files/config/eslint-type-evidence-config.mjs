// Canonical audit-only TypeScript evidence policy.
import tseslint from 'typescript-eslint';

import typeEvidence from './type-evidence-eslint-plugin.mjs';

const IGNORES = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/generated/**',
  '**/*.min.js',
  'contracts/telemetry/v1/telemetry-types.ts',
];

const TYPE_AWARE_DEFAULT_PROJECT = [
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
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    ignores: ['**/*.test.*', '**/*.spec.*', '**/test/**', '**/tests/**', '**/__tests__/**', '**/fixtures/**'],
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
