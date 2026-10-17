import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { preparePrismProcessPublication, spawnInstalledPrismProcess } from '../../../skills/prism/tests/fixtures/published-process.mjs';
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

test('actual native Prism CLI refuses invalid runtime and unavailable host prerequisites before durable admission', async t => {
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
    // The unchanged native negatives must reach the native boundary through the
    // real immutable role/generation receipts, not the retired checkout entry.
    const entryFile = fileURLToPath(new URL('../../../config/pipeline.config.json', import.meta.url));
    const built = await preparePrismProcessPublication(entryFile, 'prism-worker');
    t.after(() => fs.rmSync(built.root, { recursive: true, force: true }));
    for (const validNamespace of [false, true]) await t.test(`actual namespace ${validNamespace}`, async guest => {
      fs.writeFileSync(runtimeIdentityFile, JSON.stringify({ ...actualIdentity(),
        ...(validNamespace ? {} : { bootId: 'stale-boot' }) }), { mode: 0o600 });
      const { child } = await spawnInstalledPrismProcess(guest, entryFile, 'prism-worker', {
        PATH: process.env.PATH,
        PRISM_NATIVE_POOL_POLICY_FILE: poolFile, PRISM_NATIVE_LAUNCHER: '/usr/bin/false',
        // Original negative input, never a claim of valid engine/host admission.
        PRISM_ENGINE_CONTENT_DIGEST: `sha256:${'a'.repeat(64)}`,
        WORKER_TRUST_SPIFFE_ENABLED: 'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://test/control',
      }, false, built.code);
      let stderr = '';
      child.stderr.setEncoding('utf8'); child.stderr.on('data', bytes => { stderr += String(bytes); });
      // close follows stderr EOF; exit alone may leave the JSON diagnostic unread.
      const exited = once(child, 'close');
      const cutoff = setTimeout(() => child.kill('SIGKILL'), 20000);
      let code, signal;
      try { [code, signal] = await exited; } finally { clearTimeout(cutoff); }
      assert.equal(code, 1, stderr); assert.equal(signal, null, stderr);
      const failure = JSON.parse(stderr.trim());
      assert.equal(failure.event, 'prism_native_worker_failure');
      // A root test process can itself lack capabilities. Neither that process
      // nor a privileged process with an ordinary-filesystem pool may admit work.
      assert.match(failure.code, validNamespace ? /^WORKER_NATIVE_(ROOT_INVALID|SUPERVISOR_AUTHORITY_REQUIRED)$/ : /HOST_CGROUP_NAMESPACE_REQUIRED/);
      assert.equal(fs.existsSync(path.join(ownershipRoot, 'owners.json')), false);
      assert.equal(fs.existsSync(path.join(ownershipRoot, 'attempt-journal')), false);
      assert.deepEqual(fs.readdirSync(cgroupRoot), []);
    });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
