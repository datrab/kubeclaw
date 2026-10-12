import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { runIsolationSession } from '../../../skills/common/plugin-runtime/foundation/isolation/session.ts';
import { invokeIsolated } from '../../../skills/common/plugin-runtime/foundation/isolation/runner.ts';
import { IsolationCgroup } from '../../../skills/common/plugin-runtime/foundation/isolation/cgroup.ts';
import { hostPageSize, pageAlignedMemoryLimit } from '../../../skills/common/plugin-runtime/foundation/isolation/memory-limit.ts';
import { loadPlatformConfig } from '../../../skills/common/plugin-runtime/foundation/config/platform.ts';

const childPath = path.resolve('skills/common/plugin-runtime/foundation/isolation/child.mjs');
test('native host page query floors arbitrary byte leases without raising the ceiling', () => {
  const page = hostPageSize();
  const minimum = 16 * 1024 * 1024;
  const aligned = Math.ceil(minimum / page) * page;
  for (const budget of [aligned, aligned + 1, aligned + page - 1, aligned + page]) {
    const effective = pageAlignedMemoryLimit(budget, page);
    assert.equal(effective % page, 0);
    assert.ok(effective <= budget && budget - effective < page);
    assert.ok(effective >= minimum);
  }
  for (const invalid of [0, -1, 3, Number.MAX_SAFE_INTEGER, Infinity, NaN]) {
    assert.throws(() => pageAlignedMemoryLimit(aligned, invalid), /PAGE_SIZE_INVALID/u);
  }
  assert.throws(() => pageAlignedMemoryLimit(minimum - 1, page), /MEMORY_LIMIT_INVALID/u);
  assert.throws(() => pageAlignedMemoryLimit(aligned + 0.5, page), /MEMORY_LIMIT_INVALID/u);
});
const modulePath = path.resolve('tests/fixtures/isolation-protocol.mjs');
const context = { contract: { artifacts: [] }, async invoke(_capability, request) { return request; }, async emit() {}, artifact() {} };
function invocation(argument = {}) { return { kind: 'invoke', surface: 'stage', modulePath, exportName: 'execute', argument, context: context.contract }; }
function child() { return spawn(process.execPath, [childPath], { stdio: ['pipe', 'pipe', 'pipe'] }); }
function gone(child) { assert.equal(child.exitCode !== null || child.signalCode !== null, true, 'session must wait for child exit'); }

test('early real child exit contains pipe error and host survives', async () => {
  const process = spawn('/bin/true', [], { stdio: ['pipe', 'pipe', 'pipe'] });
  await assert.rejects(runIsolationSession({ child: process, context, wallTimeMs: 2000, invocationMessage: { value: 'x'.repeat(900000) } }), /ISOLATION_PIPE_FAILED|ISOLATED_PLUGIN_EXITED/);
  gone(process);
  await delay(25);
});

test('real plugin exit during host RPC prevents late response writing a dead pipe', async () => {
  let completed = false;
  const host = { ...context, async invoke() { await delay(80); completed = true; return { value: 'completed' }; } };
  const process = child();
  await assert.rejects(runIsolationSession({ child: process, context: host, wallTimeMs: 1000, invocationMessage: invocation({ mode: 'exit-rpc' }) }), /ISOLATED_PLUGIN_EXITED/);
  gone(process);
  await delay(100);
  assert.equal(completed, true);
});

test('unfinished RPC result cannot claim completion', async () => {
  const process = child();
  await assert.rejects(runIsolationSession({ child: process, context: { ...context, async invoke() { await delay(80); return {}; } }, wallTimeMs: 1000, invocationMessage: invocation({ mode: 'early-result' }) }), /ISOLATION_RPC_NOT_DRAINED/);
  gone(process);
  await delay(100);
});

for (const character of ['é', '€', '😀']) {
  for (let split = 1; split < Buffer.byteLength(character); split++) {
    test(`original child RPC/event/result preserves ${character} split after byte ${split}`, async () => {
      const observed = [];
      const host = { ...context, async invoke(_capability, request) { observed.push(request.text); return request; }, async emit(_type, _identity, payload) { observed.push(payload.text); } };
      const process = child();
      assert.equal(await runIsolationSession({ child: process, context: host, wallTimeMs: 2000, invocationMessage: invocation({ character, split }) }), character);
      assert.deepEqual(observed, [character, character]);
      gone(process);
    });
  }
}

for (const bytes of [[0xc0, 0xaf], [0xe2, 0x28, 0xa1], [0xf0, 0x9f]]) {
  test(`invalid UTF8 wire bytes ${bytes.join(',')} are rejected`, async () => {
    const process = child();
    await assert.rejects(runIsolationSession({ child: process, context, wallTimeMs: 1000, invocationMessage: invocation({ mode: 'invalid', bytes }) }), /ISOLATION_PROTOCOL_INVALID_UTF8/);
    gone(process);
  });
}

test('TERM-ignoring direct protocol child is killed and reaped on timeout', async () => {
  const process = child();
  await assert.rejects(runIsolationSession({ child: process, context, wallTimeMs: 100, invocationMessage: invocation({ mode: 'hang' }) }), /ISOLATED_PLUGIN_TIMEOUT/);
  gone(process);
});

test('real cgroup2 delegation is required and host platform paths resolve', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'isolation-admission-'));
  try {
    const fullContext = { ...context, contract: { artifacts: [], lease: { limits: { memoryBytes: 64 * 1024 * 1024, cpuMillis: 1000, wallTimeMs: 1000 } } } };
    await assert.rejects(invokeIsolated({ packageRoot: path.dirname(modulePath), modulePath, exportName: 'execute', surface: 'stage', argument: {}, context: fullContext }), /ISOLATION_CGROUP_REQUIRED/);
    assert.throws(() => IsolationCgroup.create(root, 64 * 1024 * 1024), /ISOLATION_CGROUP_ROOT_INVALID/);
    assert.throws(() => IsolationCgroup.create('/sys/fs/cgroup', 64 * 1024 * 1024), /ISOLATION_CGROUP_ROOT_INVALID/);
    const platform = { schemaVersion: 'pipeline-platform.v2', installationRoots: [root], trustedBuiltinRoots: [root], externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} }, providers: {}, grants: {}, adapters: {}, activeAdapters: [], observers: {}, storageRoot: 'state', shutdownTimeoutMs: 1000, orchestratorIssuerId: 'nova', administrativeDecisionIssuers: [], isolation: { cgroupRoot: 'delegated' } };
    const file = path.join(root, 'platform.json'); fs.writeFileSync(file, JSON.stringify(platform));
    assert.equal(loadPlatformConfig(file).isolation.cgroupRoot, path.join(root, 'delegated'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('changed isolation policy is pinned for recovery while builtin execution stays in process', async () => {
  const { runPipelineV2, resumePipelineV2 } = await import('../../../skills/nova/core/execution/engine.ts');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'isolation-pinned-policy-'));
  try {
    const fixture = path.resolve('tests/fixtures/plugin-system-v2');
    const platform = { schemaVersion: 'pipeline-platform.v2', installationRoots: [fixture], trustedBuiltinRoots: [fixture], externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} }, providers: {}, grants: {}, adapters: {}, activeAdapters: [], observers: {}, storageRoot: path.join(root, 'state'), shutdownTimeoutMs: 1000, orchestratorIssuerId: 'nova', administrativeDecisionIssuers: [] };
    const definition = { schemaVersion: 'pipeline-definition.v2', id: 'test:isolation-policy', maxConcurrency: 1, stages: [{ id: 'review', type: 'test.resume', dependsOn: [], config: {}, input: {}, execution: { maxAttempts: 3, maxRemediationCycles: 0, timeoutMs: 2000 } }] };
    const first = await runPipelineV2(platform, definition, 'run:isolation-policy');
    assert.equal(first.status, 'waiting');
    const wait = first.stages.get('review').wait;
    const signal = { schemaVersion: 'resume-signal.v2', signalId: 'signal:policy', idempotencyKey: 'key:policy', waitId: wait.waitId, signalType: wait.signalType, issuer: wait.authorizedIssuer, issuedAt: new Date().toISOString(), payload: { approved: true } };
    await assert.rejects(resumePipelineV2({ ...platform, isolation: { cgroupRoot: path.join(root, 'unprovisioned') } }, definition, 'run:isolation-policy', signal), /RECOVERY_RUNTIME_CONFIGURATION_MISMATCH/);
    assert.equal((await resumePipelineV2(platform, definition, 'run:isolation-policy', signal)).status, 'succeeded');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
