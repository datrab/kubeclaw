import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { syncBuiltinESMExports } from 'node:module';
import test from 'node:test';
import { busterRuntimeSelection, readTestPipeline, writeTestPipeline, canonicalPipelineEntry } from '../../fixtures/config/pipeline-components.mjs';
import { captureSwarmSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { clusterRuntimeBinding, kubernetesFixtureOptions, tailscaleExposureOptions } from '../../../skills/buster/engine/test-gates/production-cluster-options.ts';
import { createBusterCapabilityRuntime } from '../../../skills/buster/engine/test-gates/capability-runtime.ts';

function fixture(t, program) {
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
  fs.writeFileSync(binary, `#!${process.execPath}\n${program}\n`, { mode: 0o700, flag: 'wx' });
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
  for (const large of [false, true]) test(`real ${capability} output limit profile ${large}`, { timeout: 10000 }, async t => {
    const output = JSON.stringify({ metadata: { annotations: {} }, padding: 'x'.repeat(800) });
    const f = fixture(t, `process.stdout.write(${JSON.stringify(output)});`);
    const documents = readTestPipeline(canonicalPipelineEntry);
    const selected = documents['buster-engine'].profiles.runtime.settings.clusterInvokers;
    selected.shared.kubectlExecutable = f.binary;
    selected.kubernetesFixture.maximumManifestBytes = 256;
    selected.kubernetesFixture.commandOutputManifestMultiplier = large ? 8 : 1;
    selected.tailscaleExposure.maximumCommandOutputBytes = large ? 2048 : 256;
    const entry = path.join(f.root, 'bundle/pipeline.config.json'); writeTestPipeline(entry, documents);
    const snapshot = captureSwarmSettings(entry, busterRuntimeSelection(documents));
    const policy = snapshot.components['buster-engine'].settings.clusterInvokers;
    const binding = clusterRuntimeBinding({ controllerNamespace: 'test' }, policy);
    const options = { allowedCapabilities: new Set([capability]),
      ...kubernetesFixtureOptions(capability === 'kubernetes.fixture', policy, binding, 'https://registry.test'),
      ...tailscaleExposureOptions(capability === 'kubernetes.exposure', policy, binding) };
    const runtime = createBusterCapabilityRuntime(options, { jobRoot: f.root, workspaceRoot: f.root }, snapshot.components['buster-engine'].settings.execution.processInput);
    t.after(() => runtime.shutdown());
    // Mutate caller-owned options after construction; the actual command still uses the captured quota.
    if (options.kubernetesFixture) options.kubernetesFixture.commandOutputManifestMultiplier = large ? 1 : 8;
    if (options.tailscaleExposure) options.tailscaleExposure.maximumCommandOutputBytes = large ? 256 : 2048;
    const request = { operation: 'release', resource: { type: capability,
      canonicalId: `${capability === 'kubernetes.fixture' ? 'kubernetes-fixture' : 'kubernetes-exposure'}:attempt:one` },
      payload: { leaseName: 'test-one', namespace: 'test-one', serviceName: 'app', servicePort: 80,
        expiresAt: '2099-01-01T00:00:00.000Z', path: '/' } };
    if (large) assert.equal((await runtime.invoker.invoke(capability, request, new AbortController().signal)).ok, true);
    else await assert.rejects(runtime.invoker.invoke(capability, request, new AbortController().signal), /OUTPUT_LIMIT/);
    assert.equal(f.observe().actualClose, true, 'genuine child must close, not fail before spawn');
    assert(f.observe().output.length > 256, 'real output crosses low policy, below high policy');
  });
}
