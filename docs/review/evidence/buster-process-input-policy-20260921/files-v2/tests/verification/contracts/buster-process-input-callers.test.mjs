import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { syncBuiltinESMExports } from 'node:module';
import test from 'node:test';
import { createBusterCapabilityRuntime } from '../../../skills/buster/engine/test-gates/capability-runtime.ts';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'process-input-invoker-'));
  const realSpawn = childProcess.spawn, realKill = process.kill;
  let child, closed, actualClose = false, spawnHook, killHook;
  const signals = [];
  let output = '';
  t.after(async () => {
    let signalError;
    try {
      if (child && !actualClose) {
        try { realKill(-child.pid, 'SIGKILL'); }
        catch (error) { if (error.code !== 'ESRCH') signalError = error; }
        let timer;
        try { await Promise.race([closed, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('OWNED_INVOKER_CHILD_NOT_CLOSED')), 2000);
        })]); } finally { clearTimeout(timer); }
      }
      if (signalError) throw signalError;
      fs.rmSync(root, { recursive: true, force: true });
    } finally { spawnHook?.mock.restore(); killHook?.mock.restore(); syncBuiltinESMExports(); }
  });
  const binary = path.join(root, 'kubectl-fixture');
  fs.writeFileSync(binary, `#!${process.execPath}\nprocess.on('SIGTERM',()=>{});process.stdout.write('started');setInterval(()=>{},1000);\n`, { mode: 0o700, flag: 'wx' });
  spawnHook = t.mock.method(childProcess, 'spawn', function (command, args, options) {
    assert.equal(command, binary); assert.equal(child, undefined); assert.equal(options.detached, true);
    child = Reflect.apply(realSpawn, childProcess, [command, args, options]);
    closed = new Promise(resolve => child.once('close', () => { actualClose = true; resolve(); }));
    child.stdout.on('data', bytes => { output += bytes.toString(); });
    return child;
  });
  killHook = t.mock.method(process, 'kill', function (pid, signal) {
    if (child && pid === -child.pid && signal !== 0) signals.push({ signal, at: performance.now() });
    return Reflect.apply(realKill, process, [pid, signal]);
  });
  syncBuiltinESMExports();
  return { root, binary, signals, observe: () => ({ actualClose, output }) };
}
for (const capability of ['kubernetes.fixture', 'kubernetes.exposure']) {
  for (const terminationGraceMs of [50, 400]) test(`real ${capability} factory command consumes grace ${terminationGraceMs}`, { timeout: 10000 }, async t => {
    const f = fixture(t);
    const policy = { cleanupTimeoutMs: 2000, terminationGraceMs, acknowledgementPollMs: 10 };
    const common = { kubectlExecutable: f.binary, controllerNamespace: 'test', leaseApiGroup: 'example.test',
      leaseApiVersion: 'v1', allowedNamespacePrefixes: ['test'], maximumExecutionMs: 500 };
    const runtime = createBusterCapabilityRuntime({ allowedCapabilities: new Set([capability]),
      kubernetesFixture: { ...common, allowedRegistryPrefixes: ['registry.test/app'], allowedSecretReferences: [],
        allowedStorageClasses: [], allowDefaultStorageClass: false, maximumManifestBytes: 4096, maximumResources: 1,
        maximumPersistentVolumeClaimBytes: 1, maximumPersistentVolumeTotalBytes: 1, maximumRetentionSeconds: 60 },
      tailscaleExposure: { ...common, allowedHostSuffixes: ['.ts.net'], pollIntervalMs: 100 },
    }, { jobRoot: f.root, workspaceRoot: f.root }, policy);
    t.after(() => runtime.shutdown());
    policy.terminationGraceMs = 1200;
    const request = { operation: 'release', resource: { type: capability,
      canonicalId: `${capability === 'kubernetes.fixture' ? 'kubernetes-fixture' : 'kubernetes-exposure'}:attempt:one` },
      payload: { leaseName: 'lease-one', namespace: 'test-one' } };
    const prefix = capability === 'kubernetes.fixture' ? 'KUBERNETES_FIXTURE_KUBECTL' : 'TAILSCALE_EXPOSURE_KUBECTL';
    await assert.rejects(runtime.invoker.invoke(capability, request, new AbortController().signal), error =>
      (capability === 'kubernetes.fixture' ? error.cause?.message : error.message) === `${prefix}_TIMEOUT`);
    assert.deepEqual(f.observe(), { actualClose: true, output: 'started' });
    const term = f.signals.find(row => row.signal === 'SIGTERM'), kill = f.signals.find(row => row.signal === 'SIGKILL');
    assert(term && kill);
    const duration = kill.at - term.at;
    assert(duration >= terminationGraceMs - 15);
    if (terminationGraceMs === 50) assert(duration < 300);
  });
}
