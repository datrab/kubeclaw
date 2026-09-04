import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildRegistry,
  discoverPackages,
  resolveTestPlan,
} from '../../../skills/nova/core/src/index.ts';
import { provider as directCommandProvider } from '../../../skills/buster/plugins/direct-command/src/provider.js';

const pluginRoot = path.resolve('skills/buster/plugins');
const suite = JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/suites/unit.v1.json', 'utf8'));
const registry = buildRegistry(discoverPackages({
  installationRoots: [pluginRoot],
  trustPolicy: { trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(), verifierId: 'phase9:parity' },
}));
const policy = {
  defaultTimeoutMs: 10_000, maximumTimeoutMs: 30_000,
  defaultLimits: { cpuMillis: 10_000, memoryBytes: 256 * 1024 * 1024, logBytes: 1024 * 1024,
    artifactBytes: 8 * 1024 * 1024, artifactFiles: 32, processes: 8 },
  maximumLimits: { cpuMillis: 30_000, memoryBytes: 1024 * 1024 * 1024, logBytes: 8 * 1024 * 1024,
    artifactBytes: 64 * 1024 * 1024, artifactFiles: 128, processes: 32 },
  maximumRetryCount: 1, maximumMatrixSize: 16, maximumNodes: 64, defaultConcurrencyLimit: 2,
  maximumConcurrencyLimits: { unit: 4 },
};
const resolution = (declaration: any, suffix: string) => resolveTestPlan({ planId: `plan:phase9:${suffix}`,
  runId: `run:phase9:${suffix}`, project: 'phase9', scope: { moduleId: 'module', gateId: null },
  createdAt: '2026-08-12T20:00:00.000Z', declaration, suiteTemplates: [suite], registry,
  facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' }, policy });

assert.throws(() => resolution({}, 'none'), /TEST_PLAN_EMPTY/u,
  'an undeclared unit suite cannot create hidden work');
const declaration: any = { suites: { unit: { uses: 'kubeclaw.unit-suite@1', add: {
  node: { uses: 'kubeclaw.direct-command@1', mode: 'blocking', concurrencyGroup: 'unit',
    config: { executable: 'node', args: ['--test', '--test-reporter=junit', 'test/unit.mjs'],
      workingDirectory: '.', resultMode: 'junit-required', reports: [{ id: 'node-unit', format: 'junit',
        path: 'reports/unit.xml', mediaType: 'application/junit+xml' }] } },
  smoke: { uses: 'kubeclaw.direct-command@1', mode: 'advisory', concurrencyGroup: 'unit', retries: 0,
    config: { executable: 'node', args: ['scripts/smoke.mjs'], resultMode: 'exit-code' } },
} } }, concurrencyLimits: { unit: 2 } };
const plan = resolution(declaration, 'valid');
assert.equal(plan.nodes.length, 2);
assert.deepEqual(plan.nodes.map((node) => node.mode).sort(), ['advisory', 'blocking']);
assert.equal(plan.nodes.find((node) => node.id === 'unit/node')?.retryCount, 1);
assert.equal(plan.nodes.find((node) => node.id === 'unit/smoke')?.retryCount, 0);
assert.equal(new Set(plan.nodes.map((node) => node.testIdentity)).size, 2);
const nextRun = resolution(declaration, 'next-run');
assert.deepEqual(plan.nodes.map((node) => node.testIdentity), nextRun.nodes.map((node) => node.testIdentity));

for (const [index, [label, config, expected]] of ([
  ['empty executable', { executable: '', resultMode: 'exit-code' }, /TEST_PLAN_CONFIGURATION_INVALID/u],
  ['unknown field', { executable: 'node', resultMode: 'exit-code', command: 'node test.js' }, /TEST_PLAN_CONFIGURATION_INVALID/u],
  ['shell command', { executable: 'node test.js', resultMode: 'exit-code' }, /TEST_PLAN_CONFIGURATION_INVALID/u],
] as const).entries()) {
  assert.throws(() => resolution({ tests: { invalid: { uses: 'kubeclaw.direct-command@1', config } } }, `invalid-${index}`),
    expected, label);
}

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'phase9-provider-config-'));
try {
  fs.mkdirSync(path.join(workspace, 'repository')); fs.mkdirSync(path.join(workspace, 'evidence'));
  const invocation: any = { configuration: { values: { executable: 'node', resultMode: 'exit-code', reports: [] } },
    limits: { logBytes: 1024, artifactBytes: 1024, artifactFiles: 4, processes: 4,
      memoryBytes: 64 * 1024 * 1024, cpuMillis: 1000 }, timeoutMs: 1000,
    workspace: { repository: 'repository', evidence: 'evidence' } };
  const context: any = { workspaceRoot: workspace, log() {}, invoke: async () => ({ exitCode: 0, signal: null,
    stdout: '', stderr: '', records: [], resources: {} }) };
  await assert.rejects(() => directCommandProvider().execute({ ...invocation, configuration: { values: {
    executable: 'node', resultMode: 'exit-code', reports: [], environment: { BUSTER_TOKEN: 'denied' } } } }, context),
  /DIRECT_COMMAND_ENVIRONMENT_DENIED/u);
  await assert.rejects(() => directCommandProvider().execute({ ...invocation, configuration: { values: {
    executable: 'node', resultMode: 'exit-code', reports: [], workingDirectory: '../escape' } } }, context),
  /DIRECT_COMMAND_PATH_INVALID/u);
  await assert.rejects(() => directCommandProvider().execute({ ...invocation, configuration: { values: {
    executable: 'node', resultMode: 'junit-required', reports: [] } } }, context),
  /DIRECT_COMMAND_REPORT_REQUIRED/u);
} finally { fs.rmSync(workspace, { recursive: true, force: true }); }

assert.equal(fs.existsSync('skills/buster/plugins/buster-suite-runtime'), false,
  'the retired suite runtime package must stay deleted');
assert.equal(fs.existsSync('contracts/pipeline-test-gate/v1/legacy-suite-bridge.json'), false,
  'the retired migration ledger must stay deleted');

console.log(JSON.stringify({ ok: true, phase: 9, layer: 'parity', nodes: plan.nodes.length,
  explicitConfiguration: true, legacyUnitAuthority: 'deleted' }));
