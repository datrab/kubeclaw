import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkWorkerResourceContractV3, validatePipelineWorkerCoreContract, workerAttemptSpecDigest, workerProfileDigest,
  initialWorkerNativeResourceAccounting,
} from '@kubeclaw/pipeline-worker-core-contract';
import { prismNativeAttempt } from '../../../skills/prism/engine/worker-envelope.ts';
import historical from '../../../skills/prism/tests/fixtures/historical-worker-v1.json' with { type: 'json' };
import { observeNativeWorkerResources } from '../../../skills/worker/core/worker/native-resource-observation.ts';
import { assessNativeWorkerResources } from '../../../skills/worker/core/worker/native-resource-accounting.ts';

const artifact = { artifactId: 'input:protocol-test', type: 'prism-engine-input', mediaType: 'application/json',
  contentDigest: `sha256:${'1'.repeat(64)}`, sizeBytes: 2, storageUrl: 'https://control.example/input' };

test('V3 explicitly names Linux tasks while the original V1 envelope remains independently valid', () => {
  const legacy = historical.receipts[0]!.attempt;
  validatePipelineWorkerCoreContract('workerAttemptEnvelope', legacy);
  assert.equal(workerAttemptSpecDigest(legacy), legacy.attemptSpecDigest);
  assert.equal(legacy.limits.processes, 256);
  const native = prismNativeAttempt('render', artifact, 'version-test');
  assert.deepEqual(checkWorkerResourceContractV3('workerAttemptEnvelope', native), { ok: true, errors: [] });
  assert.equal(native.profile.resourceCapabilities.maximumTasks.unit, 'linux-tasks');
  assert.equal('maximumProcesses' in native.resourceBudgets, false);
  assert.equal('processes' in native.limits, false);
  assert.throws(() => validatePipelineWorkerCoreContract('workerAttemptEnvelope', native));
});

test('native contract rejects relabelled process budgets, task units and unsafe integers even with recomputed digests', () => {
  for (const mutation of ['old-field', 'old-unit', 'unsafe-integer']) {
    const native = prismNativeAttempt('render', artifact, `version-${mutation}`);
    const untrusted = JSON.parse(JSON.stringify(native));
    if (mutation === 'old-field') untrusted.resourceBudgets.maximumProcesses = untrusted.resourceBudgets.maximumTasks;
    if (mutation === 'old-unit') untrusted.profile.resourceCapabilities.maximumTasks.unit = 'processes';
    if (mutation === 'unsafe-integer') untrusted.resourceBudgets.maximumTasks.limit = Number.MAX_SAFE_INTEGER + 1;
    untrusted.profile.profileDigest = workerProfileDigest(untrusted.profile);
    untrusted.attemptSpecDigest = workerAttemptSpecDigest(untrusted);
    assert.equal(checkWorkerResourceContractV3('workerAttemptEnvelope', untrusted).ok, false, mutation);
  }
});

test('resource assessment compares real kernel task observations without manufacturing a process count', () => {
  // This exercises numeric policy with this container's original counters only.
  // It does not assert that the container is an isolated production attempt.
  const observation = observeNativeWorkerResources('/sys/fs/cgroup');
  assert.ok(observation.maximumTasks > 1);
  const native = prismNativeAttempt('render', artifact, 'task-policy');
  native.resourceBudgets.cpuTimeMs = { state: 'unrequested' };
  native.resourceBudgets.maximumMemoryBytes = { state: 'unrequested' };
  native.resourceBudgets.maximumTasks = { state: 'requested', limit: observation.maximumTasks - 1 };
  const accounting = initialWorkerNativeResourceAccounting(native);
  const batch = {
    cpuTimeMs: { status: 'observed' as const, value: Math.ceil(observation.cpuTimeMicroseconds / 1000) },
    maximumMemoryBytes: { status: 'observed' as const, value: observation.maximumMemoryBytes },
    maximumTasks: { status: 'observed' as const, value: observation.maximumTasks },
  };
  const assessed = assessNativeWorkerResources(batch, accounting, {});
  assert.equal(assessed.error?.code, 'WORKER_TASK_LIMIT');
  assert.equal(assessed.resources.maximumTasks, observation.maximumTasks);
  assert.equal('maximumProcesses' in assessed.resources, false);
  assert.deepEqual(accounting.observations, batch);
});
