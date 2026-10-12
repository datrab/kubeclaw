import { readTestBundle, writeTestBundle } from '../../../tests/fixtures/config/swarm-bundle.mjs';
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
const authored = readTestBundle(new URL('../../../charts/kubeclaw/files/config/swarm.config.json', import.meta.url));
const credentials = { PRISM_SESSION_SECRET: 'test', PRISM_INGRESS_SECRET: 'test', PRISM_INGESTION_SECRET: 'test',
  PRISM_DISPATCH_SECRET: 'test', PRISM_WORKER_SECRET: 'test', DATABASE_URL: 'postgresql://not-opened' };
const artifact = { artifactId: 'input:policy', type: 'prism-engine-input', mediaType: 'application/json',
  contentDigest: `sha256:${'a'.repeat(64)}`, sizeBytes: 2, storageUrl: 'https://control.example/input' };
function fixture(t: { after(fn: () => void): void }, policy: unknown) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-policy-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const value = structuredClone(authored); value['prism-execution'].settings.resourcePolicy = policy;
  const file = path.join(root, 'swarm.config.json'); writeTestBundle(file, value);
  return { file, value, env: { ...credentials, SWARM_CONFIG: file } };
}
for (const key of ['cpuTimeMs', 'memoryBytes', 'tasks']) for (const value of [undefined, null, '5', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
  test(`CP01 both roles reject ${key}=${String(value)}`, t => {
    const f = fixture(t, { ...authored['prism-execution'].settings.resourcePolicy, [key]: value });
    for (const load of [loadControlServerConfig, loadWorkerConfig]) assert.throws(() => load(f.env), /SWARM_CONFIG_INVALID/);
  });
}
for (const value of [undefined, null, { ...authored['prism-execution'].settings.resourcePolicy, processes: 2048 }]) {
  test('CP01 missing or competing resource policy fails', t => {
    const f = fixture(t, value);
    for (const load of [loadControlServerConfig, loadWorkerConfig]) assert.throws(() => load(f.env), /SWARM_CONFIG_INVALID/);
  });
}
for (const key of ['PRISM_NATIVE_CPU_TIME_MS', 'PRISM_NATIVE_MEMORY_BYTES', 'PRISM_NATIVE_TASKS']) test(`CP02 rejects ${key} even empty`, t => {
  const f = fixture(t, authored['prism-execution'].settings.resourcePolicy);
  for (const value of ['', '60000']) for (const load of [loadControlServerConfig, loadWorkerConfig]) {
    assert.throws(() => load({ ...f.env, [key]: value }), /SWARM_CONFIG_LEGACY_OVERRIDE/);
  }
});
for (const policy of [{ cpuTimeMs: 123, memoryBytes: 4096, tasks: 7 }, { cpuTimeMs: 456, memoryBytes: 8192, tasks: 11 }]) {
  test(`CP04 actual admission maps authored policy ${JSON.stringify(policy)}`, t => {
    const f = fixture(t, policy), control = loadControlServerConfig(f.env), worker = loadWorkerConfig(f.env);
    assert.ok(Object.isFrozen(control.nativeResourcePolicy)); assert.ok(Object.isFrozen(worker.native.resourcePolicy));
    f.value['prism-execution'].settings.resourcePolicy = { cpuTimeMs: 1, memoryBytes: 1, tasks: 1 }; writeTestBundle(f.file, f.value);
    const attempt = prismNativeAttempt('render', artifact, 'policy', control.nativeResourcePolicy);
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
  const f = fixture(t, policy), control = loadControlServerConfig(f.env), worker = loadWorkerConfig(f.env);
  const attempt = prismNativeAttempt('render', artifact, 'safe-ceiling', control.nativeResourcePolicy);
  validateWorkerResourceContractV3('workerAttemptEnvelope', attempt);
  assert.deepEqual(prismAttemptResourceLimits(attempt, worker.native.resourcePolicy, false), policy);
});
test('CP02 a loaded producer never consults later legacy environment changes', t => {
  const f = fixture(t, authored['prism-execution'].settings.resourcePolicy), config = loadControlServerConfig(f.env);
  const key = 'PRISM_NATIVE_CPU_TIME_MS', previous = process.env[key]; process.env[key] = 'invalid';
  try {
    const attempt = prismNativeAttempt('render', artifact, 'environment-independent', config.nativeResourcePolicy);
    assert.deepEqual(prismAttemptResourceLimits(attempt, config.nativeResourcePolicy, false), config.nativeResourcePolicy);
  } finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
});
