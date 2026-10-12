import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import test from 'node:test';
import { readTestBundle, writeTestBundle, canonicalSwarmEntry } from '../../fixtures/config/swarm-bundle.mjs';
import { loadSwarmSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { validateBusterRuntimeSecuritySettings } from '../../../skills/common/plugin-runtime/foundation/config/buster-cluster-invokers.ts';
import { clusterRuntimeBinding, kubernetesRuntimeSecurityOptions } from '../../../skills/buster/engine/test-gates/production-cluster-options.ts';
import { capabilitySources } from '../../../skills/buster/engine/test-gates/production-capability-sources.ts';
import { validateRuntimeRoot } from '../../../skills/buster/engine/test-gates/production-config-values.ts';
import { createBusterCapabilityRuntime } from '../../../skills/buster/engine/test-gates/capability-runtime.ts';
import { KubernetesRuntimeSecurityCapabilityInvoker, runtimeSecurityResultDigest } from '../../../skills/buster/engine/test-gates/kubernetes-runtime-security.ts';

const capability = 'kubernetes.runtime-security';
const defaults = () => structuredClone(readTestBundle(canonicalSwarmEntry)['buster-engine'].settings.clusterInvokers.runtimeSecurity);

function fixture(t, program, settings) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-security-policy-'));
  const children = [], realSpawn = childProcess.spawn;
  let hook;
  t.after(async () => {
    try {
      for (const owned of children) {
        if (!owned.closed) owned.child.kill('SIGKILL');
        let timer;
        try { await Promise.race([owned.close, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('RUNTIME_SECURITY_FIXTURE_CHILD_NOT_CLOSED')), 2000);
        })]); } finally { clearTimeout(timer); }
      }
      fs.rmSync(root, { recursive: true, force: true });
    } finally { hook?.mock.restore(); syncBuiltinESMExports(); }
  });
  const manifest = path.join(root, 'manifest.yaml'); fs.writeFileSync(manifest, 'kind: Service\n');
  const digest = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(manifest)).digest('hex')}`;
  const immutableImage = `registry.test/app@sha256:${'a'.repeat(64)}`;
  const snapshot = { phase: 'Observed', manifestDigest: digest, immutableImage, findings: [],
    totalFindingCount: 0, omittedFindingCount: 0, podCount: 1, serviceCount: 1 };
  snapshot.resultDigest = runtimeSecurityResultDigest(snapshot);
  const log = path.join(root, 'commands.jsonl');
  const binary = path.join(root, 'kubectl-fixture');
  const prefix = `const fs=require('node:fs');const path=require('node:path');const cp=require('node:child_process');\n`
    + `const log=${JSON.stringify(log)};const root=${JSON.stringify(root)};\n`
    + `const entries=fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\\n'):[];\n`
    + `fs.appendFileSync(log,JSON.stringify({at:Date.now(),args:process.argv.slice(2),path:process.env.PATH})+'\\n');\n`
    + `const snapshot=${JSON.stringify(snapshot)};snapshot.observedAt=new Date().toISOString();\n`
    + `const lease={spec:{namespaceName:'test-one'},status:{namespaceName:'test-one',runtimeSecurity:snapshot}};\n`;
  fs.writeFileSync(binary, `#!${process.execPath}\n${prefix}${program}\n`, { mode: 0o700 });
  hook = t.mock.method(childProcess, 'spawn', function (command, args, options) {
    assert.equal(command, binary);
    assert.deepEqual(args, ['get', 'busternamespaceleases.kubeclaw.forgestack.ai', 'test-lease', '-n', 'controller', '-o', 'json']);
    const child = Reflect.apply(realSpawn, childProcess, [command, args, options]);
    const owned = { child, closed: false, stdoutBytes: 0, stderrBytes: 0 };
    child.stdout.on('data', bytes => { owned.stdoutBytes += bytes.byteLength; });
    child.stderr.on('data', bytes => { owned.stderrBytes += bytes.byteLength; });
    owned.close = new Promise(resolve => child.once('close', () => { owned.closed = true; resolve(); }));
    children.push(owned); return child;
  });
  syncBuiltinESMExports();
  const documents = readTestBundle(canonicalSwarmEntry);
  const selected = documents['buster-engine'].settings.clusterInvokers;
  selected.shared.kubectlExecutable = binary;
  Object.assign(selected.runtimeSecurity, settings);
  if (settings.executableSearchPath === 'fixture') {
    const helperDirectory = path.join(root, 'helpers'); fs.mkdirSync(helperDirectory);
    fs.writeFileSync(path.join(helperDirectory, 'policy-helper'), `#!${process.execPath}\nprocess.stdout.write('selected-helper');`, { mode: 0o700 });
    selected.runtimeSecurity.executableSearchPath = [helperDirectory];
  }
  const entry = path.join(root, 'bundle/swarm.config.json'); writeTestBundle(entry, documents);
  const loaded = loadSwarmSettings({ SWARM_CONFIG: entry });
  const policy = loaded.buster.clusterInvokers;
  const sources = capabilitySources({}, new Set([capability]), {});
  const options = { allowedCapabilities: new Set([capability]), ...kubernetesRuntimeSecurityOptions(
    sources.kubernetesRuntimeSecurityEnabled, policy, clusterRuntimeBinding({ controllerNamespace: 'controller' }, policy)) };
  options.kubernetesRuntimeSecurity.allowedNamespacePrefixes = [...options.kubernetesRuntimeSecurity.allowedNamespacePrefixes];
  options.kubernetesRuntimeSecurity.executableSearchPath = [...options.kubernetesRuntimeSecurity.executableSearchPath];
  const authoredPath = [...options.kubernetesRuntimeSecurity.executableSearchPath];
  const runtime = createBusterCapabilityRuntime(options, { jobRoot: root, workspaceRoot: root }, loaded.buster.execution.processInput);
  t.after(() => runtime.shutdown());
  const request = { operation: 'inspect', payload: { leaseName: 'test-lease', namespace: 'test-one',
    manifestPath: manifest, manifestDigest: digest, immutableImage } };
  return { root, children, options, request, authoredPath,
    async confirmClosed() {
      for (const owned of children) {
        let timer;
        try { await Promise.race([owned.close, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('ACTUAL_RUNTIME_SECURITY_CHILD_CLOSE_NOT_OBSERVED')), 2000);
        })]); } finally { clearTimeout(timer); }
        assert.equal(owned.closed, true);
      }
    },
    invoke: () => runtime.invoker.invoke(capability, request, new AbortController().signal),
    observations: () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : [] };
}

for (const field of Object.keys(defaults())) test(`required RuntimeSecurity field ${field} before filesystem access`, () => {
  const settings = defaults(); delete settings[field];
  assert.throws(() => new KubernetesRuntimeSecurityCapabilityInvoker({ ...settings, workspaceRoot: '/missing-workspace',
    kubectlExecutable: '/missing-executable', controllerNamespace: 'controller', leaseApiGroup: 'kubeclaw.io' }),
  { message: 'KUBERNETES_RUNTIME_SECURITY_CONFIG_INVALID' });
});

for (const field of Object.keys(defaults())) test(`complete bundle requires ${field} even with route disabled`, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-security-required-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const documents = readTestBundle(canonicalSwarmEntry);
  delete documents['buster-engine'].settings.clusterInvokers.runtimeSecurity[field];
  const entry = path.join(root, 'swarm.config.json'); writeTestBundle(entry, documents);
  assert.throws(() => loadSwarmSettings({ SWARM_CONFIG: entry }), /SWARM_CONFIG_INVALID:component:buster-engine/);
});

const invalid = {
  allowedNamespacePrefixes: [[], [''], ['../escape']], maximumExecutionMs: [0, 2147483648, 1.5],
  maximumOutputBytes: [1023, Number.MAX_SAFE_INTEGER + 1], pollIntervalMs: [9, 10001],
  maximumObservationAgeMs: [999, 60001], maximumFutureSkewMs: [-1, 2147483648],
  diagnosticCodeUnits: [0, 1.5], executableSearchPath: [[], ['relative'], ['/bin:/escape'], ['/bin\0']],
};
for (const [field, values] of Object.entries(invalid)) for (const value of values) {
  test(`reject invalid RuntimeSecurity ${field} ${JSON.stringify(value)}`, () => {
    assert.throws(() => validateBusterRuntimeSecuritySettings({ ...defaults(), [field]: value }),
      { message: 'KUBERNETES_RUNTIME_SECURITY_CONFIG_INVALID' });
  });
}
for (const legacy of [null, {}, defaults(), 'invalid']) test(`retired RuntimeSecurity object ${JSON.stringify(legacy)}`, () => {
  assert.throws(() => validateRuntimeRoot({ schemaVersion: 'buster-remote-plan-runtime.v1', kubernetesRuntimeSecurity: legacy }),
    { message: 'SWARM_CONFIG_LEGACY_OVERRIDE:kubernetesRuntimeSecurity' });
});

test('disabled RuntimeSecurity route has no binding or implicit activation', () => {
  const policy = readTestBundle(canonicalSwarmEntry)['buster-engine'].settings.clusterInvokers;
  assert.equal(capabilitySources({}, new Set(), {}).kubernetesRuntimeSecurityEnabled, false);
  assert.deepEqual(kubernetesRuntimeSecurityOptions(false, policy, undefined), {});
});

for (const high of [false, true]) {
  test(`real execution deadline profile ${high}`, { timeout: 10000 }, async t => {
    const f = fixture(t, "setTimeout(()=>process.stdout.write(JSON.stringify(lease)),700);", { maximumExecutionMs: high ? 4000 : 250 });
    if (high) assert.equal((await f.invoke()).namespace, 'test-one');
    else await assert.rejects(f.invoke(), { message: 'KUBERNETES_RUNTIME_SECURITY_TIMEOUT' });
    await f.confirmClosed();
    assert.equal(f.children.length, 1, 'actual child started');
  });
  test(`real combined output profile ${high}`, { timeout: 10000 }, async t => {
    const f = fixture(t, "lease.padding='x'.repeat(700);process.stderr.write('e'.repeat(700));process.stdout.write(JSON.stringify(lease));",
      { maximumOutputBytes: high ? 4096 : 1500 });
    if (high) assert.equal((await f.invoke()).podCount, 1);
    else await assert.rejects(f.invoke(), { message: 'KUBERNETES_RUNTIME_SECURITY_OUTPUT_LIMIT_EXCEEDED' });
    await f.confirmClosed();
    const observed = f.children[0];
    assert(observed.stdoutBytes < 1500 && observed.stderrBytes < 1500);
    assert(observed.stdoutBytes + observed.stderrBytes > 1500, 'only combined bytes cross low profile');
    assert.equal(f.children.length, 1);
  });
  test(`real observation age profile ${high}`, { timeout: 10000 }, async t => {
    const f = fixture(t, "snapshot.observedAt=new Date(Date.now()-5000).toISOString();process.stdout.write(JSON.stringify(lease));",
      { maximumObservationAgeMs: high ? 10000 : 1000, maximumExecutionMs: 600, pollIntervalMs: 50 });
    if (high) assert.equal((await f.invoke()).podCount, 1);
    else await assert.rejects(f.invoke(), { message: 'KUBERNETES_RUNTIME_SECURITY_TIMEOUT' });
    await f.confirmClosed();
    assert(f.observations().length > 0);
  });
  test(`real future skew profile ${high}`, { timeout: 10000 }, async t => {
    const f = fixture(t, "snapshot.observedAt=new Date(Date.now()+7500).toISOString();process.stdout.write(JSON.stringify(lease));",
      { maximumFutureSkewMs: high ? 10000 : 1000, maximumExecutionMs: 600, pollIntervalMs: 50 });
    if (high) assert.equal((await f.invoke()).podCount, 1);
    else await assert.rejects(f.invoke(), { message: 'KUBERNETES_RUNTIME_SECURITY_TIMEOUT' });
    await f.confirmClosed();
    assert(f.observations().length > 0);
  });
  test(`real diagnostic code units profile ${high}`, { timeout: 10000 }, async t => {
    const count = high ? 40 : 7;
    const f = fixture(t, "process.stderr.write('abcdefghij'.repeat(10));process.exitCode=7;", { diagnosticCodeUnits: count });
    await assert.rejects(f.invoke(), { message: `KUBERNETES_RUNTIME_SECURITY_EXECUTION_FAILED:${'abcdefghij'.repeat(10).slice(0, count)}` });
    await f.confirmClosed();
    assert.equal(f.children.length, 1);
  });
  test(`real PATH helper profile ${high}`, { timeout: 10000 }, async t => {
    const f = fixture(t, "const found=cp.spawnSync('policy-helper',[],{encoding:'utf8'});if(found.stdout!=='selected-helper'){process.stderr.write('helper-unavailable');process.exitCode=7;}else process.stdout.write(JSON.stringify(lease));",
      { executableSearchPath: high ? 'fixture' : ['/nonexistent-policy-directory'] });
    f.options.kubernetesRuntimeSecurity.executableSearchPath.splice(0, 1, '/caller-mutated-path');
    if (high) assert.equal((await f.invoke()).podCount, 1);
    else await assert.rejects(f.invoke(), { message: 'KUBERNETES_RUNTIME_SECURITY_EXECUTION_FAILED:helper-unavailable' });
    await f.confirmClosed();
    assert.equal(f.children.length, 1);
    assert.deepEqual(f.observations()[0].path.split(path.delimiter), f.authoredPath);
  });
}

test('real polling profile changes command cadence; selected arrays and scalars captured', { timeout: 15000 }, async t => {
  const elapsed = [];
  for (const interval of [50, 1200]) {
    await t.test(`poll interval ${interval}`, async sub => {
      const f = fixture(sub, "if(entries.length===0)snapshot.phase='Pending';process.stdout.write(JSON.stringify(lease));",
        { pollIntervalMs: interval, maximumExecutionMs: 6000 });
      f.options.kubernetesRuntimeSecurity.pollIntervalMs = 10;
      f.options.kubernetesRuntimeSecurity.allowedNamespacePrefixes.splice(0, 1, 'denied');
      assert.equal((await f.invoke()).namespace, 'test-one');
      await f.confirmClosed();
      const observations = f.observations(); assert.equal(observations.length, 2);
      const delta = observations[1].at - observations[0].at;
      assert(delta >= interval, `poll ${interval}: actual separation ${delta}`); elapsed.push(delta);
    });
  }
  assert(elapsed[1] - elapsed[0] >= 600, `distinct authored poll effects: ${elapsed}`);
});

for (const allowed of [false, true]) test(`real namespace profile ${allowed}`, { timeout: 10000 }, async t => {
  const f = fixture(t, 'process.stdout.write(JSON.stringify(lease));', { allowedNamespacePrefixes: [allowed ? 'test' : 'other'] });
  if (allowed) assert.equal((await f.invoke()).namespace, 'test-one');
  else await assert.rejects(f.invoke(), { message: 'KUBERNETES_RUNTIME_SECURITY_NAMESPACE_DENIED' });
  await f.confirmClosed();
  assert.equal(f.children.length, allowed ? 1 : 0);
});
