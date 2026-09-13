import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { requireNativeWorkerRuntimeIdentity } from '../../../skills/worker/core/worker/native-runtime-identity.ts';

function actualIdentity() {
  const namespace = fs.statSync('/proc/self/ns/cgroup', { bigint: true });
  return { schemaVersion: 1, bootId: fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(),
    cgroupNamespace: { device: String(namespace.dev), inode: String(namespace.ino) } };
}

test('runtime authority binds the actual kernel boot and cgroup namespace, and rejects stale or writable evidence', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'native-runtime-identity-'));
  try {
    const file = path.join(directory, 'runtime.json');
    const current = actualIdentity();
    fs.writeFileSync(file, JSON.stringify(current), { mode: 0o600 });
    requireNativeWorkerRuntimeIdentity(file);
    for (const invalid of [{ ...current, bootId: 'previous-boot' },
      { ...current, cgroupNamespace: { ...current.cgroupNamespace, inode: '0' } }]) {
      fs.writeFileSync(file, JSON.stringify(invalid));
      assert.throws(() => requireNativeWorkerRuntimeIdentity(file), /HOST_CGROUP_NAMESPACE_REQUIRED/);
    }
    fs.writeFileSync(file, JSON.stringify(current)); fs.chmodSync(file, 0o666);
    assert.throws(() => requireNativeWorkerRuntimeIdentity(file), /RUNTIME_IDENTITY_NOT_TRUSTED/);
    fs.chmodSync(file, 0o600);
    const link = path.join(directory, 'link.json'); fs.symlinkSync(file, link);
    assert.throws(() => requireNativeWorkerRuntimeIdentity(link), /ELOOP/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('actual native Prism CLI refuses invalid runtime and unavailable host prerequisites before durable admission', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'native-prism-startup-'));
  try {
    const poolFile = path.join(directory, 'pool.json');
    const runtimeIdentityFile = path.join(directory, 'runtime.json');
    const ownershipRoot = path.join(directory, 'ownership');
    const cgroupRoot = path.join(directory, 'ordinary-filesystem'); fs.mkdirSync(cgroupRoot);
    const nodeIdentityFile = path.join(directory, 'node-id');
    fs.writeFileSync(nodeIdentityFile, fs.readFileSync('/etc/machine-id'), { mode: 0o600 });
    fs.writeFileSync(poolFile, JSON.stringify({ schemaVersion: 1, role: 'prism', nodeName: 'startup-test',
      policyDigest: 'a'.repeat(64), cgroupRoot, ownershipRoot, nodeIdentityFile, runtimeIdentityFile,
      maximumActiveScopes: 2, limits: { memoryBytes: 16 * 1024 ** 3, tasks: 4096,
        cpuQuotaMicroseconds: 400000, cpuPeriodMicroseconds: 100000 } }), { mode: 0o600 });
    for (const validNamespace of [false, true]) {
      fs.writeFileSync(runtimeIdentityFile, JSON.stringify({ ...actualIdentity(),
        ...(validNamespace ? {} : { bootId: 'stale-boot' }) }), { mode: 0o600 });
      const result = spawnSync(process.execPath, ['skills/prism/server/native-worker.ts'], {
        encoding: 'utf8', timeout: 20000, env: { PATH: process.env.PATH,
          PRISM_NATIVE_POOL_POLICY_FILE: poolFile, PRISM_NATIVE_LAUNCHER: '/usr/bin/false',
          PRISM_WORKER_EXECUTION_MODE: 'native',
          PRISM_ENGINE_CONTENT_DIGEST: `sha256:${'a'.repeat(64)}`,
          WORKER_TRUST_SPIFFE_ENABLED: 'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://test/control', PORT: '0' },
      });
      assert.equal(result.error, undefined); assert.equal(result.status, 1, result.stderr);
      const failure = JSON.parse(result.stderr.trim());
      assert.equal(failure.event, 'prism_native_worker_failure');
      // A root test process can itself lack capabilities. Neither that process
      // nor a privileged process with an ordinary-filesystem pool may admit work.
      assert.match(failure.code, validNamespace ? /^WORKER_NATIVE_(ROOT_INVALID|SUPERVISOR_AUTHORITY_REQUIRED)$/ : /HOST_CGROUP_NAMESPACE_REQUIRED/);
      assert.equal(fs.existsSync(path.join(ownershipRoot, 'owners.json')), false);
      assert.equal(fs.existsSync(path.join(ownershipRoot, 'attempt-journal')), false);
      assert.deepEqual(fs.readdirSync(cgroupRoot), []);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
