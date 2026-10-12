// Canonical JavaScript and TypeScript lint policy for OpenClaw/KubeClaw.
// Rules are blocking. Existing genuine debt is fingerprinted in lint-baseline.json.
import { discipline } from './discipline-eslint-plugin.mjs';

import tseslint from 'typescript-eslint';

const PRODUCTION_IGNORES = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/test/**',
  '**/tests/**',
  '**/__tests__/**',
  '**/fixtures/**',
  '**/generated/**',
  'contracts/telemetry/v1/telemetry-types.ts',
];

const TEST_FILES = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/test/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
  '**/tests/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
  '**/__tests__/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
];

const CONSOLE_BOUNDARIES = [
  // Provider subprocess entrypoint: loads the pinned provider and frames its console output as IPC.
  'skills/buster/engine/test-gates/provider-child.mjs',
  'scripts/**/*.mjs',
  'skills/common/plugin-runtime/foundation/isolation/child.mjs',
  'skills/nova/core/cli.ts',
  'skills/nova/plugins/lint/src/engine/output.ts',
  'skills/nova/project_setup/tools/progress-scaffold.ts',
];

const ENVIRONMENT_BOUNDARIES = [
  // Read-only startup preflight validates and pins the selected component generation before effects.
  'scripts/buster-cluster-preflight.mjs',
  // Kubernetes command adapters forward the platform's existing transport environment.
  'skills/buster/engine/test-gates/kubernetes-command-environment.ts',
  'skills/buster/engine/test-gates/tailscale-exposure-runtime.ts',
  // Fixed Buster native process boundaries: startup snapshot or closed assigned host inputs.
  'skills/buster/engine/test-gates/preparation-host.ts',
  'skills/buster/engine/test-gates/preparation-cleanup-host.ts',
  'skills/buster/engine/test-gates/preparation-historical-host.ts',
  'skills/buster/engine/test-gates/preparation-supervisor.ts',
  'skills/buster/engine/remote-plan-cli.ts',
  // Build metadata subprocess and GitHub workflow input/output adapters.
  'scripts/browser-archive-lock.mjs',
  'scripts/updates/runtime-inputs.mjs',
  'scripts/gitops.mjs',
  'scripts/updates/refresh-versions.mjs',
  'tools/ops-mcp/src/config.mjs',
  'scripts/verify-ops-mcp-live.mjs',
  'scripts/registry-client-config.mjs', 'scripts/build-native-worker-nri.mjs',
  'skills/prism/server/studio-config.ts',
  'skills/prism/server/control-config.ts',
  'skills/prism/server/worker-config.ts',
  'skills/prism/config/native-worker.ts',
  'skills/prism/config/database-bootstrap.ts',
  'scripts/clawpatch-pipeline-light.mjs',
  'scripts/verify-all-skill-tests.mjs',
  'scripts/verify-plugin-live-capabilities.mjs',
  'scripts/verify-plugin-packages.mjs',
  'skills/common/plugin-runtime/foundation/registry/import-audit-child.mjs',
  'skills/common/plugin-runtime/foundation/registry/import-audit.ts',
  'skills/common/plugins/openclaw-agent-observer/src/config.ts',
  'skills/common/plugins/secret-resolver/src/adapter.ts',
  'skills/common/plugin-runtime/foundation/config/platform.ts',
  'skills/nova/plugins/lint/src/engine/execution.ts',
];

const DYNAMIC_MODULE_BOUNDARIES = [
  // Provider subprocess entrypoint: loads the pinned provider and frames its console output as IPC.
  'skills/buster/engine/test-gates/provider-child.mjs',
  'skills/nova/pipeline.ts',
  'skills/common/plugin-runtime/foundation/isolation/child.mjs',
  'skills/common/plugin-runtime/foundation/isolation/runner.ts',
  'skills/common/plugin-runtime/foundation/registry/activation.ts',
  'skills/common/plugin-runtime/foundation/registry/import-audit-child.mjs',
];

export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**', '**/*.min.js'],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: TEST_FILES,
    plugins: { discipline },
    rules: {
      complexity: ['error', { max: 70, variant: 'classic' }],
      'max-depth': ['error', { max: 6 }],
      'max-lines': ['error', { max: 2_000, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 650, skipBlankLines: true, skipComments: true, IIFEs: true }],
      'max-params': ['error', { max: 12 }],
      'no-async-promise-executor': 'error',
      'no-global-assign': 'error',
      'no-useless-catch': 'error',
      'no-var': 'error',
      'discipline/filename-case': 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    ignores: PRODUCTION_IGNORES,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: process.cwd(),
      },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
  {
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'],
    ignores: PRODUCTION_IGNORES,
    plugins: { discipline },
    rules: {
      complexity: ['error', { max: 15, variant: 'classic' }],
      'max-depth': ['error', { max: 3 }],
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true, IIFEs: true }],
      'max-params': ['error', { max: 7 }],
      'no-global-assign': 'error',
      'no-console': 'error',
      'no-useless-catch': 'error',
      'no-var': 'error',
      'discipline/filename-case': 'error',
      'discipline/no-direct-env-access': 'error',
      'discipline/no-dynamic-module-loading': 'error',
      'discipline/no-env-default': 'error',
      'discipline/no-fallback-chain': 'error',
      'discipline/no-swallowed-error': 'error',
      'discipline/no-top-level-mutable-state': 'error',
    },
  },
  {
    files: ENVIRONMENT_BOUNDARIES,
    rules: { 'discipline/no-direct-env-access': 'off' },
  },
  {
    files: DYNAMIC_MODULE_BOUNDARIES,
    rules: { 'discipline/no-dynamic-module-loading': 'off' },
  },
  {
    files: CONSOLE_BOUNDARIES,
    rules: { 'no-console': 'off' },
  },
];
