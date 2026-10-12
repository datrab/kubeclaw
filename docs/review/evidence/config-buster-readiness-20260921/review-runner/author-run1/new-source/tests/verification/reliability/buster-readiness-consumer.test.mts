import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildRegistry, discoverPackages } from '@kubeclaw/nova-core';
import { BusterRemotePlanService, type BusterRemotePlanServiceOptions } from '../../../skills/buster/engine/test-gates/remote-plan-service.ts';
import { admissionFixture } from '../../fixtures/test-gate/buster-admission.mts';
import { readinessRuntime, readinessExecutable, observeReadinessDiagnostics, assertProbeFinished } from '../../fixtures/test-gate/buster-readiness-profile.mts';
import { loadProductionBusterRemotePlanRuntime } from '../../../skills/buster/engine/test-gates/production.ts';
import type { BusterSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { writeTestBundle } from '../../fixtures/config/swarm-bundle.mjs';

const profile = { maximumActiveJobs: 1, maximumQueuedJobs: 2, maximumConcurrentAttempts: 3 };
for (const scenario of [
  { name: 'execution', policy: { maximumExecutionMs: 300, maximumOutputBytes: 4096 }, delayMs: 1200, bytes: 0, ready: false, code: 'DEPENDENCY_TIMEOUT' },
  { name: 'execution', policy: { maximumExecutionMs: 2500, maximumOutputBytes: 4096 }, delayMs: 1200, bytes: 0, ready: true, code: 'DEPENDENCY_OK' },
  { name: 'output', policy: { maximumExecutionMs: 2500, maximumOutputBytes: 64 }, delayMs: 0, bytes: 256, ready: false, code: 'DEPENDENCY_OUTPUT_LIMIT' },
  { name: 'output', policy: { maximumExecutionMs: 2500, maximumOutputBytes: 1024 }, delayMs: 0, bytes: 256, ready: true, code: 'DEPENDENCY_OK' },
]) {
  test(`real factory/service/process honors ${scenario.name} policy ${JSON.stringify(scenario.policy)}`, { timeout: 30000 }, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-readiness-consumer-'));
    const input = { ...scenario.policy };
    const f = readinessRuntime(root, input, true);
    const runtime = f.create();
    const diagnostic = observeReadinessDiagnostics();
    try {
      // This changes the file author after loading, not the direct service options.
      input.maximumExecutionMs = 30000; input.maximumOutputBytes = 1048576;
      f.documents['buster-engine'].settings.dependencyReadiness = input;
      writeTestBundle(f.file, f.documents);
      f.set(scenario.delayMs, scenario.bytes, 0);
      const address = await runtime.start();
      const origin = `http://127.0.0.1:${address.port}`;
      for (const route of ['/healthz', '/bootstrapz']) assert.equal((await fetch(origin + route)).status, 200);
      const response = await fetch(origin + '/readyz');
      assert.equal(response.status, scenario.ready ? 200 : 503);
      const value = await response.json();
      assert.equal(value.ready, scenario.ready);
      assert.equal(value.code, scenario.ready ? 'BUSTER_READY' : 'BUSTER_DEPENDENCY_UNAVAILABLE');
      // All profiles prove genuine start, invocation and observed termination.
      assertProbeFinished(f.invocations, 1);
      assert.equal(diagnostic.events.length, 1);
      assert.equal(diagnostic.events[0]!.code, scenario.code);

    } finally { try { await runtime.stop(); } finally { diagnostic.restore(); fs.rmSync(root, { recursive: true, force: true }); } }
  });
}

test('factory disabled capability does not execute configured dependency and rejects retired runtime authors', { timeout: 30000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-readiness-disabled-'));
  const f = readinessRuntime(root, { maximumExecutionMs: 500, maximumOutputBytes: 512 }, false);
  const runtime = f.create();
  try {
    f.set(10000, 10000, 31);
    const address = await runtime.start();
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/readyz`)).status, 200);
    assert.equal(fs.existsSync(f.invocations), false);
    for (const dependencyReadiness of [undefined, null, {}, { maximumExecutionMs: 30001, maximumOutputBytes: 1024 }]) {
      const invalid = { ...f.settings.buster, dependencyReadiness } as unknown as BusterSettings;
      assert.throws(() => loadProductionBusterRemotePlanRuntime(f.profile.runtime, f.preparation, invalid,
        f.settings.workerCore.localRuntime, f.profile.environment), /SWARM_CONFIG_BUSTER_DEPENDENCY_READINESS_INVALID/);
      assert.equal(fs.existsSync(f.invocations), false);
    }
    for (const dependencyReadiness of [null, {}, { maximumExecutionMs: 1000, maximumOutputBytes: 65536 }]) {
      fs.writeFileSync(f.profile.runtime, JSON.stringify({ ...f.source, dependencyReadiness }));
      assert.throws(f.create, /SWARM_CONFIG_LEGACY_OVERRIDE:dependencyReadiness/);
      assert.equal(fs.existsSync(f.invocations), false);
    }
  } finally { await runtime.stop(); fs.rmSync(root, { recursive: true, force: true }); }
});

test('real service fails invalid policy before probe even when disabled; unavailable probe fences admission and accepted replay, not terminal replay', { timeout: 30000 }, async () => {
  const f = await admissionFixture(profile);
  const executable = readinessExecutable(f.root);
  const plugins = path.resolve('skills/buster/plugins');
  const registry = buildRegistry(discoverPackages({ installationRoots: [plugins], trustPolicy: {
    trustedBuiltinRoots: [plugins], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'admission' } }));
  let executions = 0;
  const options: BusterRemotePlanServiceOptions = { store: f.store, preparation: f.store.modeledPreparation, registry,
    workerRevision: 'a'.repeat(40), runtimeRoot: path.join(f.root, 'probe-runs'), admission: profile,
    workerLocalRuntime: { drainTimeoutMs: 300000, cancellationTimeoutMs: 30000, replayLimit: 65536 },
    dependencyReadiness: { maximumExecutionMs: 2000, maximumOutputBytes: 1024 },
    allowedCapabilities: new Set(['container.build']), containerBuild: {
      buildctlExecutable: executable.executable, buildkitHost: 'unix:///fixture-not-buildkit.sock',
      registryBaseUrl: 'https://registry.example.test', registryReference: 'registry.example.test', repositoryPrefix: 'fixture',
      allowedPlatforms: ['linux/amd64'], allowedBuildArguments: [], maximumLogBytes: 1024,
      maximumExecutionMs: 1000, maximumManifestBytes: 1024 },
    execute: async () => { executions += 1; throw new Error('unexpected execution'); } };
  const service = new BusterRemotePlanService(options);
  try {
    for (const dependencyReadiness of [undefined, null, {}, { maximumExecutionMs: 0, maximumOutputBytes: 1024 },
      { maximumExecutionMs: 1000 }, { maximumOutputBytes: 65536 }]) {
      assert.throws(() => new BusterRemotePlanService({ ...options, allowedCapabilities: new Set(), dependencyReadiness } as unknown as BusterRemotePlanServiceOptions),
        /SWARM_CONFIG_BUSTER_DEPENDENCY_READINESS_INVALID/);
      assert.equal(fs.existsSync(executable.invocations), false);
    }
    for (const [field, maximum] of [['maximumExecutionMs', 30000], ['maximumOutputBytes', 1048576]] as const) {
      for (const value of [null, false, true, '1000', [], {}, 0, -1, 1.5, maximum + 1]) {
        assert.throws(() => new BusterRemotePlanService({ ...options, allowedCapabilities: new Set(),
          dependencyReadiness: { ...options.dependencyReadiness, [field]: value } } as unknown as BusterRemotePlanServiceOptions),
        /SWARM_CONFIG_BUSTER_DEPENDENCY_READINESS_INVALID/);
        assert.equal(fs.existsSync(executable.invocations), false);
      }
      for (const value of [1, maximum]) {
        const valid = new BusterRemotePlanService({ ...options, allowedCapabilities: new Set(),
          dependencyReadiness: { ...options.dependencyReadiness, [field]: value } });
        await valid.shutdown(5000); assert.equal(fs.existsSync(executable.invocations), false);
      }
    }
    // Direct service options are separate from a serialized config author.
    let captureChecks = 0;
    for (const scenario of [
      { policy: { maximumExecutionMs: 300, maximumOutputBytes: 4096 }, delay: 1200, bytes: 0, code: 'DEPENDENCY_TIMEOUT' },
      { policy: { maximumExecutionMs: 2500, maximumOutputBytes: 64 }, delay: 0, bytes: 256, code: 'DEPENDENCY_OUTPUT_LIMIT' },
    ]) {
      const policy = { ...scenario.policy };
      const captured = new BusterRemotePlanService({ ...options, dependencyReadiness: policy });
      const diagnostic = observeReadinessDiagnostics();
      try {
        policy.maximumExecutionMs = 30000; policy.maximumOutputBytes = 1048576;
        executable.set(scenario.delay, scenario.bytes, 0);
        await captured.recover();
        const result = await captured.readiness();
        assert.equal(result.ready, false);
        assert.equal(result.code, 'BUSTER_DEPENDENCY_UNAVAILABLE');
        captureChecks += 1; assertProbeFinished(executable.invocations, captureChecks);
        assert.equal(diagnostic.events.length, 1);
        assert.equal(diagnostic.events[0]!.code, scenario.code);
      } finally { try { await captured.shutdown(5000); } finally { diagnostic.restore(); } }
    }
    executable.set(0, 0, 7);
    const encode = (job: ReturnType<typeof f.job>) => (async function* () { yield Buffer.from(JSON.stringify(job)); })();
    const rejected = f.job('readiness-new', 1);
    await assert.rejects(service.submit(encode(rejected)), /BUSTER_DEPENDENCY_UNAVAILABLE/);
    assert.equal((await f.store.records()).length, 0); assert.equal(executions, 0);
    const accepted = f.job('readiness-replay', 1);
    await f.store.accept(accepted, new Date().toISOString());
    const before = await f.store.get(accepted.jobId);
    await assert.rejects(service.submit(encode(accepted)), /BUSTER_DEPENDENCY_UNAVAILABLE/);
    assert.deepEqual(await f.store.get(accepted.jobId), before); assert.equal(executions, 0);
    const terminal = await service.cancel(accepted.jobId);
    assert.equal(terminal.state, 'cancelled');
    const calls = fs.readFileSync(executable.invocations);
    assert.deepEqual(await service.submit(encode(accepted)), terminal);
    assert.deepEqual(fs.readFileSync(executable.invocations), calls); assert.equal(executions, 0);
  } finally { await service.shutdown(5000); await f.close(); }
});
