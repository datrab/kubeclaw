import { fileURLToPath } from 'node:url';
import { captureSwarmSettings, type PrismResourcePolicy } from '../../common/plugin-runtime/foundation/config/swarm.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadControlServerConfig } from '../server/control-config.ts';
import { loadWorkerConfig } from '../server/worker-config.ts';
import { prismNativeAttempt } from '../engine/worker-envelope.ts';
import { prismAttemptResourceLimits, requirePrismResourcePoolCapacity } from '../config/resource-policy.ts';
import { validateWorkerResourceContractV3 } from '@kubeclaw/pipeline-worker-core-contract';
const configRoot = fileURLToPath(new URL('../../../config/', import.meta.url));
const policyDefaults = JSON.parse(fs.readFileSync(path.join(configRoot, 'components/prism-execution.config.json'), 'utf8')).profiles.standard.settings.resourcePolicy;
const credentials = { PRISM_SESSION_SECRET: 'test', PRISM_INGRESS_SECRET: 'test', PRISM_INGESTION_SECRET: 'test',
  PRISM_DISPATCH_SECRET: 'test', PRISM_WORKER_SECRET: 'test', DATABASE_URL: 'postgresql://not-opened' };
const artifact = { artifactId: 'input:policy', type: 'prism-engine-input', mediaType: 'application/json',
  contentDigest: `sha256:${'a'.repeat(64)}`, sizeBytes: 2, storageUrl: 'https://control.example/input' };
function fixture(t: { after(fn: () => void): void }, policy: unknown) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-policy-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(configRoot, root, { recursive: true });
  const file = path.join(root, 'components/prism-execution.config.json');
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  value.profiles.standard.settings.resourcePolicy = policy;
  const write = () => fs.writeFileSync(file, JSON.stringify(value));
  write();
  const load = (callerId: 'prism-control' | 'prism-worker') => {
    const entryFile = path.join(root, 'pipeline.config.json');
    const entry = JSON.parse(fs.readFileSync(entryFile, 'utf8'));
    const instanceId = `kubeclaw/prism/${callerId}`;
    const captured = captureSwarmSettings(entryFile, { role: 'prism', callerId, serviceInstanceId: instanceId,
      bindings: entry.bindings.filter((binding: { instanceId: string }) => binding.instanceId === instanceId)
        .map(({ role: _role, ...binding }: { role: string; owner: string; instanceId: string; profileId: string }) => binding) });
    // Actual role-selected consumer policy, not a boot receipt or native-host admission.
    const resourcePolicy = captured.components['prism-execution']!.settings.resourcePolicy as unknown as PrismResourcePolicy;
    return Object.freeze({ nativeResourcePolicy: resourcePolicy, native: Object.freeze({ resourcePolicy }) });
  };
  return { file, value, write, load, env: credentials };
}
for (const key of ['cpuTimeMs', 'memoryBytes', 'tasks']) for (const value of [undefined, null, '5', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
  test(`CP01 both roles reject ${key}=${String(value)}`, t => {
    const f = fixture(t, { ...policyDefaults, [key]: value });
    for (const role of ['prism-control', 'prism-worker'] as const) assert.throws(() => f.load(role), /SWARM_CONFIG_INVALID/);
  });
}
for (const value of [undefined, null, { ...policyDefaults, processes: 2048 }]) {
  test('CP01 missing or competing resource policy fails', t => {
    const f = fixture(t, value);
    for (const role of ['prism-control', 'prism-worker'] as const) assert.throws(() => f.load(role), /SWARM_CONFIG_INVALID/);
  });
}
for (const key of ['PRISM_NATIVE_CPU_TIME_MS', 'PRISM_NATIVE_MEMORY_BYTES', 'PRISM_NATIVE_TASKS']) test(`CP02 rejects ${key} even empty`, t => {
  const f = fixture(t, policyDefaults);
  for (const value of ['', '60000']) for (const load of [loadControlServerConfig, loadWorkerConfig]) {
    assert.throws(() => load(undefined as never, { ...f.env, [key]: value }), /SWARM_CONFIG_LEGACY_OVERRIDE/);
  }
});
for (const policy of [{ cpuTimeMs: 123, memoryBytes: 4096, tasks: 7 }, { cpuTimeMs: 456, memoryBytes: 8192, tasks: 11 }]) {
  test(`CP04 actual admission maps authored policy ${JSON.stringify(policy)}`, t => {
    const f = fixture(t, policy), control = f.load('prism-control'), worker = f.load('prism-worker');
    assert.ok(Object.isFrozen(control.nativeResourcePolicy)); assert.ok(Object.isFrozen(worker.native.resourcePolicy));
    f.value.profiles.standard.settings.resourcePolicy = { cpuTimeMs: 1, memoryBytes: 1, tasks: 1 }; f.write();
    const attempt = prismNativeAttempt('render', artifact, 'policy', control.nativeResourcePolicy, 600000, 300000, 10000, 1048576, 16777216, 134217728, 64);
    validateWorkerResourceContractV3('workerAttemptEnvelope', attempt);
    assert.deepEqual(prismAttemptResourceLimits(attempt, worker.native.resourcePolicy, false), policy);
    assert.equal(attempt.profile.resourceCapabilities.maximumTasks.unit, 'linux-tasks');
    for (const metric of ['cpuTimeMs', 'maximumMemoryBytes', 'maximumTasks'] as const) {
      const excess = structuredClone(attempt), budget = excess.resourceBudgets[metric]; assert.equal(budget.state, 'requested');
      if (budget.state !== 'requested') throw new Error('requested fixture required'); budget.limit++;
      assert.throws(() => prismAttemptResourceLimits(excess, worker.native.resourcePolicy, false), new RegExp(`PRISM_NATIVE_BUDGET_NOT_ACCEPTED:${metric}`));
      assert.doesNotThrow(() => prismAttemptResourceLimits(excess, worker.native.resourcePolicy, true));
      excess.resourceBudgets[metric] = { state: 'unrequested' };
      assert.throws(() => prismAttemptResourceLimits(excess, worker.native.resourcePolicy, true), /PRISM_NATIVE_BUDGET_NOT_ACCEPTED/);
    }
    requirePrismResourcePoolCapacity(policy, { memoryBytes: policy.memoryBytes, tasks: policy.tasks });
    for (const metric of ['memoryBytes', 'tasks'] as const) {
      assert.throws(() => requirePrismResourcePoolCapacity(policy, { ...policy, [metric]: policy[metric] - 1 }), /PRISM_NATIVE_POLICY_EXCEEDS_POOL/);
    }
  });
}
test('CP01 resource safe-integer ceiling is independent of transport timer ceiling', t => {
  const policy = { cpuTimeMs: Number.MAX_SAFE_INTEGER, memoryBytes: Number.MAX_SAFE_INTEGER, tasks: Number.MAX_SAFE_INTEGER };
  const f = fixture(t, policy), control = f.load('prism-control'), worker = f.load('prism-worker');
  const attempt = prismNativeAttempt('render', artifact, 'safe-ceiling', control.nativeResourcePolicy, 600000, 300000, 10000, 1048576, 16777216, 134217728, 64);
  validateWorkerResourceContractV3('workerAttemptEnvelope', attempt);
  assert.deepEqual(prismAttemptResourceLimits(attempt, worker.native.resourcePolicy, false), policy);
});
test('CP02 a loaded producer never consults later legacy environment changes', t => {
  const f = fixture(t, policyDefaults), config = f.load('prism-control');
  const key = 'PRISM_NATIVE_CPU_TIME_MS', previous = process.env[key]; process.env[key] = 'invalid';
  try {
    const attempt = prismNativeAttempt('render', artifact, 'environment-independent', config.nativeResourcePolicy, 600000, 300000, 10000, 1048576, 16777216, 134217728, 64);
    assert.deepEqual(prismAttemptResourceLimits(attempt, config.nativeResourcePolicy, false), config.nativeResourcePolicy);
  } finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
});
