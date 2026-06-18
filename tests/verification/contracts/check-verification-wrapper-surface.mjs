import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-verification-wrapper-surface' });
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

const { sourceRoot } = parseArgs();
const helperPath = path.join(sourceRoot, 'tests/verification/lib/run-contract-suite.sh');
const shellHelperPath = path.join(sourceRoot, 'tests/verification/lib/verification-shell.sh');
const cleanupPath = path.join(sourceRoot, 'tests/verification/lib/cleanup-home-artifacts.sh');
const behaviorPath = path.join(sourceRoot, 'tests/verification/behavior/verify.mjs');
const fastPath = path.join(sourceRoot, 'tests/verification/run-fast-verification.sh');
const fullPath = path.join(sourceRoot, 'tests/verification/run-full-verification.sh');

const helperSource = fs.readFileSync(helperPath, 'utf8');
const shellHelperSource = fs.readFileSync(shellHelperPath, 'utf8');
const cleanupSource = fs.readFileSync(cleanupPath, 'utf8');
const behaviorSource = fs.readFileSync(behaviorPath, 'utf8');
const fastSource = fs.readFileSync(fastPath, 'utf8');
const fullSource = fs.readFileSync(fullPath, 'utf8');

assert.equal(fastSource.includes('tests/verification/lib/run-contract-suite.sh'), true, 'fast wrapper should delegate deterministic contract list to shared helper');
assert.equal(fullSource.includes('tests/verification/lib/run-contract-suite.sh'), true, 'full wrapper should delegate deterministic contract list to shared helper');
assert.equal(fastSource.includes('tests/verification/lib/verification-shell.sh'), true, 'fast wrapper should use shared quiet shell runner');
assert.equal(fullSource.includes('tests/verification/lib/verification-shell.sh'), true, 'full wrapper should use shared quiet shell runner');
assert.equal(shellHelperSource.includes('verification_run_step()'), true, 'shared shell runner should expose quiet step execution');
assert.equal(shellHelperSource.includes('VERIFICATION_VERBOSE'), true, 'shared shell runner should preserve verbose opt-in');
assert.equal(shellHelperSource.includes('WARNING output from'), true, 'shared shell runner should print warning output from passing steps');
assert.equal(shellHelperSource.includes('FAILED: $label'), true, 'shared shell runner should print failure labels');
assert.equal(fullSource.includes('all verification surfaces passed'), false, 'full wrapper should stay silent on clean passes by default');
assert.equal(fastSource.includes('fast local verification passed'), false, 'fast wrapper should stay silent on clean passes by default');
assert.equal(fastSource.includes('tests/verification/lib/cleanup-home-artifacts.sh'), true, 'fast wrapper should clean /home verification artifacts');
assert.equal(fullSource.includes('tests/verification/lib/cleanup-home-artifacts.sh'), true, 'full wrapper should clean /home verification artifacts');
assert.equal(cleanupSource.includes('WORKSPACE_ROOT="${VERIFICATION_WORKSPACE_ROOT:-/home/node/.openclaw/workspace}"'), true, 'cleanup helper should target the OpenClaw workspace root');
assert.equal(cleanupSource.includes('behavior-poll-dual-*'), true, 'cleanup helper should cover poll-dual behavior artifacts');
assert.equal(cleanupSource.includes('debug-poll-*'), true, 'cleanup helper should cover debug poll artifacts');
assert.equal(cleanupSource.includes('status-store-slice-*'), true, 'cleanup helper should cover status-store slice artifacts');
assert.equal(cleanupSource.includes('module-completion-test-*'), true, 'cleanup helper should cover os.tmpdir module completion artifacts');
assert.equal(cleanupSource.includes('operator-alert-fallback-contract-*'), true, 'cleanup helper should cover operator alert fallback artifacts');
assert.equal(cleanupSource.includes('observability-ingester-test-*'), true, 'cleanup helper should cover observability ingester artifacts');
assert.equal(cleanupSource.includes('[[ "$HOME_ROOT" != "/home" ]]'), true, 'cleanup helper should refuse broad non-/home roots');
assert.equal(cleanupSource.includes('[[ "$WORKSPACE_ROOT" != "/home/node/.openclaw/workspace" ]]'), true, 'cleanup helper should refuse unexpected workspace roots');
assert.equal(behaviorSource.includes('tests/verification/lib/cleanup-home-artifacts.sh'), true, 'behavior harness should run shared artifact cleanup directly');
assert.equal(/for contract in \\/.test(fastSource), false, 'fast wrapper should not own a private contract list');
assert.equal(/run_step "buster operator surface"/.test(fullSource), false, 'full wrapper should not keep stale hand-expanded contract steps');
assert.equal(helperSource.includes('check-verification-wrapper-surface.mjs'), true, 'shared contract helper should include this drift guard');

const listed = execFileSync(helperPath, ['--source-root', sourceRoot, '--list'], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);
const listSet = new Set(listed);
assert.equal(listed.length, listSet.size, 'shared deterministic contract list should not contain duplicates');

const requiredContracts = [
  'check-telemetry-contract.mjs',
  'check-buster-repo-scoped-paths.mjs',
  'check-buster-verify-task-scope.mjs',
  'check-redis-completion-service-surface.mjs',
  'check-pipeline-complexity-budgets.mjs',
  'check-strict-cli-args-surface.mjs',
  'check-blueprint-commit-scope.mjs',
  'check-canonical-pipeline-compat-freeze.mjs',
  'check-canonical-pipeline-compat-debt-free.mjs',
  'check-artifact-authority-slice-surface.mjs',
  'check-observability-catch-reporting.mjs',
  'check-operator-alert-surface.mjs',
  'check-critical-dynamic-imports.mjs',
  'check-gateway-operation-boundary-surface.mjs',
  'check-common-pipeline-facades-surface.mjs',
  'check-session-authority-slice-surface.mjs',
  'check-session-polling-surface.mjs',
  'check-phase9-unpaired-js-surface.mjs',
  'check-phase10-paired-facade-surface.mjs',
  'check-phase10-executable-delegate-surface.mjs',
  'check-phase10-nova-agent-prompt-runner-facades.mjs',
  'check-phase10-nova-service-facades.mjs',
  'check-phase10-nova-tool-adapter-surface.mjs',
  'check-phase10-final-reference-surface.mjs',
  'check-prompt-ingress-surface.mjs',
  'check-verification-wrapper-surface.mjs',
];
for (const contract of requiredContracts) {
  assert.equal(listSet.has(contract), true, `shared deterministic contract list should include ${contract}`);
}

assert.equal(fullSource.includes('check-subagent-launch.mjs'), true, 'full wrapper should keep full-only subagent launch smoke');
assert.equal(fullSource.includes('check-deployment-truth.mjs'), true, 'full wrapper should keep full-only deployment truth');
assert.equal(fullSource.includes('tests/verification/run-local-acp-verification.sh'), true, 'full wrapper should include ACP launch verification');
assert.equal(fullSource.includes('LIVE_REDIS_SMOKE_REQUIRED=1'), true, 'full wrapper should require live Redis smoke instead of allowing a silent skip');
assert.equal(fullSource.includes('tests/verification/live/redis-backend-smoke.mjs'), true, 'full wrapper should include live Redis backend smoke');
assert.equal(fullSource.includes('npm run docs:check'), true, 'full wrapper should include docs checks');
assert.equal(fullSource.includes('git diff --check'), true, 'full wrapper should include whitespace checks');
assert.equal(fullSource.includes('ACP launch reachability is local-only and is not part of the default clean-checkout gate.'), false, 'full wrapper should not describe ACP as outside the full gate');
assert.equal(fastSource.includes('SKIP_FAST_BEHAVIOR'), true, 'fast wrapper should keep fast-only behavior skip switch');
assert.equal(fastSource.includes('--areas "$BEHAVIOR_AREAS"'), true, 'fast wrapper should keep selected behavior area support');

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: requiredContracts.length, contracts: listed.length }));
