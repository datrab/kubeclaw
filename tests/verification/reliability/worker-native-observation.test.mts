import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pbkdf2Sync } from 'node:crypto';
import test from 'node:test';
import { observeNativeWorkerResources } from '../../../skills/worker/core/worker/native-resource-observation.ts';
import { NativeWorkerResourceScope } from '../../../skills/worker/core/worker/native-resource-scope.ts';

test('original kernel observations preserve task units and cumulative CPU', () => {
  const before = observeNativeWorkerResources('/sys/fs/cgroup');
  pbkdf2Sync('worker-observation', 'actual-cpu-work', 20000, 32, 'sha256');
  const after = observeNativeWorkerResources('/sys/fs/cgroup');
  assert.equal(after.unit, 'linux-tasks');
  assert.ok(after.cpuTimeMicroseconds > before.cpuTimeMicroseconds);
  assert.ok(after.maximumMemoryBytes >= before.maximumMemoryBytes);
  assert.ok(after.maximumTasks >= before.maximumTasks);
  assert.ok(after.oomKills >= before.oomKills);
  assert.ok(after.taskLimitHits >= before.taskLimitHits);
  assert.equal(after.populated, true);
  // This is the test container's scope, not proof of attempt isolation.
  assert.equal('maximumProcesses' in after, false);
});

test('ordinary directories cannot substitute for a kernel cgroup', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-native-negative-'));
  try {
    assert.throws(() => observeNativeWorkerResources(root), /WORKER_NATIVE_CGROUP_REQUIRED/u);
    assert.throws(() => NativeWorkerResourceScope.create(root, { memoryBytes: 64 * 1024 * 1024, tasks: 512 }),
      /WORKER_NATIVE_ROOT_INVALID/u);
    assert.deepEqual(fs.readdirSync(root), []);
  } finally { fs.rmdirSync(root); }
});

test('host root and invalid limits are rejected before scope allocation', () => {
  for (const root of ['/', '/sys/fs/cgroup', 'relative']) {
    assert.throws(() => NativeWorkerResourceScope.create(root, { memoryBytes: 64 * 1024 * 1024, tasks: 512 }),
      /WORKER_NATIVE_ROOT_INVALID/u);
  }
  for (const invalid of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => NativeWorkerResourceScope.create('/sys/fs/cgroup', { memoryBytes: 64 * 1024 * 1024, tasks: invalid }),
      /WORKER_NATIVE_LIMIT_INVALID/u);
    assert.throws(() => NativeWorkerResourceScope.create('/sys/fs/cgroup', { memoryBytes: invalid, tasks: 512 }),
      /WORKER_NATIVE_LIMIT_INVALID/u);
  }
});
