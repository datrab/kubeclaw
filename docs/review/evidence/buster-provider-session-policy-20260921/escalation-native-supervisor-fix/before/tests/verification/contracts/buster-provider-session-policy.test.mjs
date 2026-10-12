import assert from 'node:assert/strict';
import fs from 'node:fs';
import test, { after } from 'node:test';
import { TestPlanRunner } from '../../../skills/buster/engine/test-gates/runner.ts';
import { RegisteredTestProviderLoader } from '../../../skills/buster/engine/test-gates/provider-loader.ts';
import { ProviderProcessSession } from '../../../skills/buster/engine/test-gates/provider-process-session.ts';
import { runnerExecutionPolicy } from '../../fixtures/test-gate/execution-policy.mts';
import { sessionOptions, temporary } from '../../fixtures/test-gate/session-policy.mjs';
import { validateBusterProviderRuntimeSettings } from '../../../skills/common/plugin-runtime/foundation/config/buster-execution.ts';

after(async () => { await fs.promises.rm(temporary, { recursive: true, force: true }); });
const fields = ['maximumProtocolBytes', 'terminationGraceMs', 'terminationTimeoutMs', 'capabilityDrainTimeoutMs',
  'minimumHeapMiB', 'heapFraction', 'maximumPendingCapabilities', 'minimumOpenFiles', 'artifactFileDescriptorReserve'];
function runtimePolicy() { return structuredClone({ provider: runnerExecutionPolicy.provider, observation: runnerExecutionPolicy.observation }); }

for (const field of fields) test(`required session policy ${field} rejects before package/process access`, () => {
  for (const value of [undefined, null, true, false, '1', 0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const candidate = runtimePolicy();
    if (value === undefined) delete candidate.provider[field]; else candidate.provider[field] = value;
    assert.throws(() => new RegisteredTestProviderLoader(candidate), /SWARM_CONFIG_BUSTER_PROVIDER_RUNTIME_INVALID/);
    // Missing package/invocation deliberately cannot be touched before validation.
    assert.throws(() => new ProviderProcessSession(null, null, '/does-not-exist', candidate), /SWARM_CONFIG_BUSTER_PROVIDER_RUNTIME_INVALID/);
  }
  if (field !== 'heapFraction') {
    const candidate = runtimePolicy(); candidate.provider[field] = 1.5;
    assert.throws(() => validateBusterProviderRuntimeSettings(candidate), /SWARM_CONFIG_BUSTER_PROVIDER_RUNTIME_INVALID/);
  }
});

test('fractional heap selection and immutable complete runtime snapshot', () => {
  for (const heapFraction of [0.1, 0.7, 1]) {
    const candidate = runtimePolicy(); candidate.provider.heapFraction = heapFraction;
    const snapshot = validateBusterProviderRuntimeSettings(candidate);
    assert.equal(snapshot.provider.heapFraction, heapFraction);
    candidate.provider.heapFraction = 0.5;
    assert.equal(snapshot.provider.heapFraction, heapFraction);
    assert(Object.isFrozen(snapshot)); assert(Object.isFrozen(snapshot.provider)); assert(Object.isFrozen(snapshot.observation));
  }
  const candidate = runtimePolicy(); candidate.provider.heapFraction = 1.01;
  assert.throws(() => validateBusterProviderRuntimeSettings(candidate), /SWARM_CONFIG_BUSTER_PROVIDER_RUNTIME_INVALID/);
  assert.throws(() => new RegisteredTestProviderLoader(runnerExecutionPolicy.observation), /SWARM_CONFIG_BUSTER_PROVIDER_RUNTIME_INVALID/);
});

for (const maximumProtocolBytes of [1024, 65536]) test(`actual child stdout uses protocol cap ${maximumProtocolBytes}`, { timeout: 30000 }, async () => {
  const options = sessionOptions(`protocol-${maximumProtocolBytes}`, { maximumProtocolBytes }, "const observed = 'x'.repeat(2048);");
  const result = await new TestPlanRunner(options).run();
  if (maximumProtocolBytes === 1024) {
    assert.equal(result.attempts[0].executionState, 'errored');
    assert.match(result.attempts[0].summary, /TEST_PROVIDER_PROTOCOL_LIMIT/);
  } else {
    assert.equal(result.attempts[0].outcome, 'passed');
    assert.equal(JSON.parse(result.attempts[0].summary).length, 2048);
  }
});

for (const field of ['minimumHeapMiB', 'heapFraction']) test(`actual V8 heap consumes selected ${field}`, { timeout: 60000 }, async () => {
  const observed = [];
  for (const value of field === 'minimumHeapMiB' ? [32, 64] : [0.1, 0.2]) {
    const policy = field === 'minimumHeapMiB' ? { minimumHeapMiB: value, heapFraction: 0.01 } : { minimumHeapMiB: 16, heapFraction: value };
    const options = sessionOptions(`heap-${field}-${value}`, policy,
      'const observed = { heap: v8.getHeapStatistics().heap_size_limit, args: process.execArgv };');
    const result = await new TestPlanRunner(options).run();
    assert.equal(result.attempts[0].outcome, 'passed');
    const actual = JSON.parse(result.attempts[0].summary);
    const heapMiB = Math.max(policy.minimumHeapMiB, Math.floor(options.plan.nodes[0].limits.memoryBytes / (1024 * 1024) * policy.heapFraction));
    assert(actual.args.includes(`--max-old-space-size=${heapMiB}`));
    assert(actual.heap > 0); observed.push(actual.heap);
  }
  assert(observed[1] > observed[0], 'actual V8 heap capacity must increase, beyond argument forwarding');
});

for (const field of ['minimumOpenFiles', 'artifactFileDescriptorReserve']) test(`actual descriptor exhaustion consumes ${field}`, { timeout: 60000 }, async () => {
  const counts = [];
  for (const value of [64, 96]) {
    const options = sessionOptions(`fd-${field}-${value}`, { minimumOpenFiles: 32, artifactFileDescriptorReserve: 1, [field]: value }, `
      const descriptors = []; let observed;
      try { for (let i = 0; i < 256; i++) descriptors.push(fs.openSync(context.workspaceRoot + '/' + invocation.workspace.scratch + '/fd-probe', 'w')); }
      catch (error) { if (error.code !== 'EMFILE') throw error; observed = descriptors.length; }
      finally { for (const fd of descriptors) fs.closeSync(fd); }
      if (observed === undefined) throw new Error('EXPECTED_REAL_EMFILE');
    `);
    const result = await new TestPlanRunner(options).run();
    assert.equal(result.attempts[0].outcome, 'passed'); counts.push(JSON.parse(result.attempts[0].summary));
  }
  assert(counts[0] > 0); assert(counts[1] > counts[0]);
});

test('real uncooperative child consumes selected SIGKILL escalation grace', { timeout: 60000 }, async t => {
  let activeGroup;
  const signals = [];
  const originalKill = process.kill;
  t.mock.method(process, 'kill', function (pid, signal) {
    const at = performance.now();
    const returned = Reflect.apply(originalKill, process, [pid, signal]);
    if (pid === activeGroup && (signal === 'SIGTERM' || signal === 'SIGKILL')) signals.push({ signal, at });
    return returned;
  });
  for (const terminationGraceMs of [50, 500]) {
    const options = sessionOptions(`escalation-${terminationGraceMs}`, { terminationGraceMs }, `
      fs.writeFileSync(context.workspaceRoot + '/' + invocation.workspace.scratch + '/ready-pid', String(process.pid));
      while (true) {}
    `);
    const controller = new AbortController();
    const running = new TestPlanRunner({ ...options, signal: controller.signal }).run();
    const { waitForNamedFile } = await import('../../fixtures/test-gate/runner-contract-fixture.mts');
    let pid;
    try {
      await waitForNamedFile(options.workspaceRoot + '/test-attempts', 'ready-pid');
      const names = fs.readdirSync(options.workspaceRoot + '/test-attempts', { recursive: true, encoding: 'utf8' });
      const marker = names.find(name => name.endsWith('/ready-pid'));
      assert(marker); pid = Number(fs.readFileSync(options.workspaceRoot + '/test-attempts/' + marker, 'utf8'));
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const group = Number(stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/u)[2]);
      assert(Number.isSafeInteger(group) && group > 0);
      activeGroup = -group;
      signals.length = 0;
      controller.abort(new Error('escalation profile probe'));
      const result = await running;
      const term = signals.find(item => item.signal === 'SIGTERM');
      const kill = signals.find(item => item.signal === 'SIGKILL');
      assert(term && kill, 'real own-group TERM and KILL must both be forwarded');
      const escalationDelay = kill.at - term.at;
      if (terminationGraceMs === 50) {
        assert(escalationDelay >= 25 && escalationDelay < 300, `50ms escalation observed ${escalationDelay}ms`);
      } else assert(escalationDelay >= 400, `500ms escalation observed ${escalationDelay}ms`);
      assert.equal(result.nodes[0].state, 'cancelled');
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, 'real child must be gone');
    } finally {
      controller.abort(new Error('probe finalization')); await running;
    }
  }
});
