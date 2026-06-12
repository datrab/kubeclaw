import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-buster-completion-controller-surface' });
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

const { sourceRoot } = parseArgs();
const controllerPath = path.join(sourceRoot, 'skills/nova/pipeline/services/buster-completion-controller.ts');
const eventContractPath = path.join(sourceRoot, 'skills/common/pipeline/services/pipeline-event-contract.ts');
const pollingPath = path.join(sourceRoot, 'skills/nova/pipeline/services/polling.ts');
const pollingDualPath = path.join(sourceRoot, 'skills/nova/pipeline/services/polling-dual.ts');
const gateCompletionPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/buster-gate-completion.ts');
const gateRunnerPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/buster-gate-runner.ts');
const controllerSource = fs.readFileSync(controllerPath, 'utf8');
const pollingSource = fs.readFileSync(pollingPath, 'utf8');
const pollingDualSource = fs.readFileSync(pollingDualPath, 'utf8');
const gateCompletionSource = fs.readFileSync(gateCompletionPath, 'utf8');
const gateRunnerSource = fs.readFileSync(gateRunnerPath, 'utf8');

assert.equal(controllerSource.includes("'completion.evidence'"), true, 'controller must wait for completion.evidence');
assert.equal(controllerSource.includes("'local.evidence.updated'"), true, 'controller must wait for local.evidence.updated');
assert.equal(controllerSource.includes("'fatal.error'"), true, 'controller must wait for fatal.error');
assert.equal(controllerSource.includes('waitForAny(eventBus, BUSTER_COMPLETION_EVENT_TYPES, identity'), true, 'controller must use event contract waitForAny');
assert.equal(controllerSource.includes('adjudicateCompletionEvidence({'), true, 'controller must delegate Redis terminal decisions to the existing adjudicator');
assert.equal(controllerSource.includes('rawEntry.run_id ?? rawEntry.runId ?? expectedIdentity'), false, 'controller must not backfill Redis completion run_id from expected identity');
assert.equal(controllerSource.includes('entry.run_id ?? expectedIdentity'), false, 'controller must not repair invalid Redis completion identity from expected identity');
assert.equal(controllerSource.includes('setTimeout'), false, 'controller must not impose a mandatory local filesystem catch-up delay');
assert.equal(controllerSource.includes('buildGateLocalEvidenceResolver'), true, 'controller should expose gate local evidence wake/context helpers');
assert.equal(pollingDualSource.includes('export async function waitForModuleBusterCompletion('), true, 'module Buster cutover must expose an event-driven wait wrapper');
assert.equal(pollingDualSource.includes('createRedisCompletionEventAdapter(config'), true, 'module Buster wait must start the Redis completion event adapter');
assert.equal(pollingDualSource.includes('createLocalEvidenceEventAdapter(config'), true, 'module Buster wait must start the local evidence adapter');
assert.equal(pollingDualSource.includes('waitForBusterCompletion({'), true, 'module Buster wait must delegate to the shared controller');
assert.equal(pollingSource.includes('return waitForModuleBusterCompletion('), true, 'pollDual must now use event-driven module completion wait');
assert.equal(pollingSource.includes('return pollGeneric(\n    config,\n    createPollDualCheck'), false, 'pollDual must not wrap Buster module completion in pollGeneric after cutover');
assert.equal(gateCompletionSource.includes('export async function waitBusterGateCompletionEvidence('), true, 'gate cutover must expose an event-driven completion wait');
assert.equal(gateCompletionSource.includes('buildGateLocalEvidenceResolver(projectGateCompletionState'), false, 'gate wait must not resolve completion from local output_file evidence');
assert.equal(gateCompletionSource.includes("if (fileCompletion.outcome === 'rate_limited')"), false, 'local gate-status evidence must not trigger domain rate-limit cooldowns');
assert.equal(gateRunnerSource.includes('deps.waitBusterGateCompletionEvidence({'), true, 'Buster gate runner must call event-driven gate completion wait');
assert.equal(gateRunnerSource.includes('deps.pollGeneric(config, async () => pollBusterGateCompletionEvidence'), false, 'Buster gate runner must not wrap gate completion in pollGeneric after cutover');
assert.equal(pollingDualSource.includes('export function createPollDualCheck('), false, 'Phase 6 cleanup must remove the legacy module completion polling check');
assert.equal(gateCompletionSource.includes('export async function pollBusterGateCompletionEvidence('), false, 'Phase 6 cleanup must remove the legacy gate completion polling check');
assert.equal(gateCompletionSource.includes('function buildRedisCompletionPollResult('), false, 'P11 must delete the legacy Redis completion poll-result wrapper');
assert.equal(gateCompletionSource.includes('function buildFileCompletionPollResult('), false, 'P11 must delete the legacy file completion poll-result wrapper');
assert.equal(gateCompletionSource.includes('adjudicateCompletionEvidence'), false, 'P11 gate adapter must not re-adjudicate P17 controller completion evidence');
assert.equal(gateCompletionSource.includes('getLocalStatus: () => projectGateCompletionState(config, gateId, gate'), true, 'gate wait may read local output_file state only as Redis conflict context');
assert.equal(gateCompletionSource.includes('completion: controllerResult.completion'), true, 'P11 gate adapter must pass through the controller adjudication result');
assert.equal(gateCompletionSource.includes('localCompletion: controllerResult.local_completion'), false, 'P11 gate adapter must not pass local completion as terminal authority');
assert.equal(gateCompletionSource.includes('gateStatusPath'), false, 'Buster gate completion wait must not watch legacy gate-status.json as completion authority');
assert.equal(gateCompletionSource.includes("controllerResult?.source === 'legacy_status:gate-status.json'"), false, 'Buster gate completion adapter must not map legacy gate-status.json as a completion source');

const controller = await import(pathToFileURL(controllerPath).href);
const eventContract = await import(pathToFileURL(eventContractPath).href);
const pollingDual = await import(pathToFileURL(pollingDualPath).href);
const gateCompletion = await import(pathToFileURL(gateCompletionPath).href);

function testPollResult(ok, reason, data) {
  return { ok, reason, data };
}

function redisEntry(overrides = {}) {
  return {
    _id: '1-0',
    schema_version: 'v1',
    type: 'completion',
    stream_role: 'completion',
    project: 'controller-test',
    target_kind: 'module',
    target_id: '01',
    module: '01',
    run_id: 'run-controller',
    attempt: '2',
    dispatch_id: 'dispatch-controller',
    session_key: 'agent:main:acp:controller',
    source: 'buster-pipeline',
    status: 'PASS',
    outcome: 'PASS',
    summary: 'passed',
    timestamp: '2026-05-11T00:00:00.000Z',
    ...overrides,
  };
}

function flattenRedisFields(entry = {}) {
  return Object.entries(entry).flatMap(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]);
}

function makeSingleEntryRedisCtor(entry, stream = 'swarm:pipeline:controller-test:completions') {
  return class SingleEntryRedis {
    constructor() {
      this.status = 'ready';
      this.entry = entry;
      this.pendingRejects = [];
    }

    on() {}

    async xread() {
      if (this.entry) {
        const current = this.entry;
        this.entry = null;
        return [[stream, [[current._id || '1-0', flattenRedisFields(current)]]]];
      }
      return new Promise((_resolve, reject) => {
        this.pendingRejects.push(reject);
      });
    }

    disconnect() {
      for (const reject of this.pendingRejects.splice(0)) reject(new Error('connection is closed'));
    }
  };
}

function emitRedis(bus, entry = redisEntry()) {
  bus.emit({
    type: 'completion.evidence',
    source: 'redis',
    identity: {
      module_id: entry.module,
      gate_id: entry.gate_id,
      run_id: entry.run_id,
      attempt: entry.attempt,
      dispatch_id: entry.dispatch_id,
      session_key: entry.session_key,
    },
    payload: {
      stream_key: 'swarm:pipeline:controller-test:completions',
      redis_id: entry._id,
      entry,
    },
  });
}

{
  const bus = eventContract.createPipelineEventBus();
  const abort = new AbortController();
  let localReads = 0;
  const waiter = controller.waitForBusterCompletion({
    eventBus: bus,
    identity: { module_id: '01', run_id: 'run-controller', attempt: '2', dispatch_id: 'dispatch-controller' },
    expectedIdentity: { run_id: 'run-controller', attempt: '2', dispatch_id: 'dispatch-controller', session_key: 'agent:main:acp:controller' },
    targetKind: 'module',
    targetId: '01',
    signal: abort.signal,
    timeoutMs: 1000,
    getLocalStatus: () => { localReads += 1; return null; },
  });

  emitRedis(bus);
  const result = await waiter;
  assert.equal(result.resolved, true);
  assert.equal(result.source, 'redis');
  assert.equal(result.reason, 'target_reached');
  assert.equal(result.completion.status, 'PASS');
  assert.equal(result.completion.authority_policy.allow_redis_authority, true);
  assert.equal(localReads, 1, 'controller should not wait for a second local check before resolving valid Redis terminal evidence');
  assert.equal(bus.listenerCount(), 0);
}

{
  const bus = eventContract.createPipelineEventBus();
  const abort = new AbortController();
  const waiter = controller.waitForBusterCompletion({
    eventBus: bus,
    identity: { module_id: '01', run_id: 'run-controller' },
    expectedIdentity: { run_id: 'run-controller', attempt: '2', dispatch_id: 'dispatch-controller' },
    targetKind: 'module',
    targetId: '01',
    signal: abort.signal,
    timeoutMs: 1000,
  });

  bus.emit({
    type: 'local.evidence.updated',
    source: 'local_fs',
    identity: { module_id: '01', run_id: 'run-controller' },
    payload: { paths: ['.swarm/modules/01/buster-output.json'] },
  });
  setTimeout(() => emitRedis(bus), 0);
  const result = await waiter;
  assert.equal(result.resolved, true);
  assert.equal(result.source, 'redis', 'local module evidence should be a wakeup/context event, not a required terminal result');
  assert.equal(result.reason, 'target_reached');
  assert.equal(bus.listenerCount(), 0);
}

{
  const event = {
    type: 'completion.evidence',
    source: 'redis',
    identity: { module_id: '02', run_id: 'run-invalid' },
    payload: {
      redis_id: '2-0',
      entry: redisEntry({
        _id: '2-0',
        module: '02',
        target_id: '02',
        run_id: 'run-invalid',
        attempt: '1',
        dispatch_id: 'dispatch-invalid',
        session_key: 'agent:main:acp:invalid',
        status: 'BROKEN',
      }),
    },
  };
  const result = controller.resolveBusterCompletionEvent({
    event,
    targetKind: 'module',
    targetId: '02',
    expectedIdentity: { run_id: 'run-invalid', attempt: '1', dispatch_id: 'dispatch-invalid', session_key: 'agent:main:acp:invalid' },
  });
  assert.equal(result.resolved, true);
  assert.equal(result.reason, 'completion_conflict');
  assert.equal(result.invalid_redis_entry, true);
  assert.equal(result.redis_entry.outcome, 'COMPLETION_INVALID');
  assert.equal(result.completion.completion_conflict, true);
}

{
  const resolver = controller.buildGateLocalEvidenceResolver(() => ({
    done: true,
    ok: false,
    outcome: 'verdict_fail',
    source: 'output_file',
    data: { gate: 'quality', status: 'FAIL', reason: 'tests failed' },
  }), {
    config: {},
    gateId: 'quality',
    gate: { type: 'buster' },
    activeDispatch: { run_id: 'run-gate', attempt: '1', dispatch_id: 'dispatch-gate' },
  });
  const result = resolver({ type: 'local.evidence.updated', source: 'local_fs', identity: { gate_id: 'quality' }, payload: {} });
  assert.equal(result.resolved, false, 'output_file FAIL must wake/context only; Redis completion remains terminal authority');
  assert.equal(result.reason, 'local_evidence_pending');
  assert.equal(result.source, 'output_file');
  assert.equal(result.local_completion.data.status, 'FAIL');
}

{
  const resolver = controller.buildGateLocalEvidenceResolver(() => ({
    done: false,
    ok: false,
    outcome: 'candidate_rate_limited',
    source: 'legacy_status:gate-status.json',
    status: 'RATE_LIMITED',
    data: { status: 'RATE_LIMITED', run_id: 'run-gate', attempt: '1', dispatch_id: 'dispatch-gate' },
  }), {
    config: {},
    gateId: 'quality',
    gate: { type: 'buster' },
    activeDispatch: { run_id: 'run-gate', attempt: '1', dispatch_id: 'dispatch-gate' },
  });
  const result = resolver({ type: 'local.evidence.updated', source: 'local_fs', identity: { gate_id: 'quality' }, payload: {} });
  assert.equal(result.resolved, false, 'manual gate-status RATE_LIMITED injection must not resolve local gate evidence');
  assert.equal(result.reason, 'local_evidence_pending');
  assert.equal(result.local_completion.outcome, 'candidate_rate_limited');
}

{
  const bus = eventContract.createPipelineEventBus();
  const abort = new AbortController();
  const waiter = controller.waitForBusterCompletion({
    eventBus: bus,
    identity: { module_id: 'fatal-module' },
    signal: abort.signal,
    timeoutMs: 1000,
  });
  bus.emit({
    type: 'fatal.error',
    source: 'system',
    identity: { module_id: 'fatal-module' },
    payload: { reason: 'adapter_failed' },
  });
  const result = await waiter;
  assert.equal(result.resolved, true);
  assert.equal(result.reason, 'fatal_error');
  assert.equal(result.error.reason, 'adapter_failed');
  assert.equal(bus.listenerCount(), 0);
}


{
  const bus = eventContract.createPipelineEventBus();
  const abort = new AbortController();
  const waiter = controller.waitForBusterCompletion({
    eventBus: bus,
    identity: { module_id: 'stale-filter', run_id: 'run-stale' },
    expectedIdentity: { run_id: 'run-stale', attempt: '1', dispatch_id: 'dispatch-stale' },
    targetKind: 'module',
    targetId: 'stale-filter',
    signal: abort.signal,
    timeoutMs: 1000,
  });
  bus.emit({
    type: 'completion.evidence',
    source: 'redis',
    identity: { module_id: 'wrong-module', run_id: 'run-stale' },
    payload: { entry: redisEntry({ module: 'wrong-module', target_id: 'wrong-module', run_id: 'run-stale', attempt: '1', dispatch_id: 'dispatch-stale' }) },
  });
  assert.equal(bus.listenerCount(), 1, 'controller wait should ignore stale identity events and keep waiting');
  setTimeout(() => emitRedis(bus, redisEntry({
    module: 'stale-filter',
    target_id: 'stale-filter',
    run_id: 'run-stale',
    attempt: '1',
    dispatch_id: 'dispatch-stale',
    session_key: 'agent:main:acp:controller',
  })), 0);
  const result = await waiter;
  assert.equal(result.resolved, true);
  assert.equal(result.reason, 'target_reached');
  assert.equal(result.redis_entry.module, 'stale-filter');
  assert.equal(bus.listenerCount(), 0, 'controller stale-event wait should clean up listener after later match');
}

{
  const bus = eventContract.createPipelineEventBus();
  const abort = new AbortController();
  await assert.rejects(
    controller.waitForBusterCompletion({
      eventBus: bus,
      identity: { module_id: 'controller-timeout' },
      targetKind: 'module',
      targetId: 'controller-timeout',
      signal: abort.signal,
      timeoutMs: 5,
    }),
    (error) => error?.name === 'PipelineEventWaitTimeoutError'
      && error?.code === 'PIPELINE_EVENT_WAIT_TIMEOUT'
      && error?.diagnostics?.identity?.module_id === 'controller-timeout',
    'controller wait should propagate structured waitForAny timeout errors',
  );
  assert.equal(bus.listenerCount(), 0, 'controller timeout should clean event listeners');
}

{
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-module-completion-wait-'));
  const swarmDir = path.join(tempRoot, '.swarm');
  fs.mkdirSync(path.join(swarmDir, 'modules', '01'), { recursive: true });
  const expectedIdentity = {
    run_id: 'run-module-wrapper',
    attempt: '1',
    dispatch_id: 'dispatch-module-wrapper',
    session_key: 'agent:main:acp:module-wrapper',
  };
    const deps = {
      completionEventAdapters: {
        RedisCtor: makeSingleEntryRedisCtor(redisEntry({
          module: '01',
          target_id: '01',
          run_id: expectedIdentity.run_id,
          attempt: expectedIdentity.attempt,
          dispatch_id: expectedIdentity.dispatch_id,
          session_key: expectedIdentity.session_key,
        })),
      },
    };
const config = {
    project: 'controller-test',
    _runId: 'run-module-wrapper',
    run_id: 'run-module-wrapper',
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(swarmDir, 'modules'),
    },
      };
  const result = await pollingDual.waitForModuleBusterCompletion(
    config,
    '01',
    '01',
    ['PASS'],
    0.02,
    expectedIdentity,
    testPollResult,
    { deps },
  );
  assert.equal(result.ok, true, 'module wrapper should map event-driven Redis PASS to a successful poll result');
  assert.equal(result.reason, 'target_reached');
  assert.equal(result.data._source, 'redis');
  assert.equal(result.data._redis_entry.dispatch_id, expectedIdentity.dispatch_id);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

{
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-gate-completion-wait-'));
  const swarmDir = path.join(tempRoot, '.swarm');
  fs.mkdirSync(path.join(swarmDir, 'gates'), { recursive: true });
  const completionIdentity = {
    runId: 'run-gate-wrapper',
    attempt: '1',
    dispatchId: 'dispatch-gate-wrapper',
    gateway_label: 'gateway-gate-wrapper',
    sessionKey: 'agent:main:acp:gate-wrapper',
  };
    const configDeps2 = {
      completionEventAdapters: {
        RedisCtor: makeSingleEntryRedisCtor({
          _id: '1-0',
          schema_version: 'v1',
          type: 'completion',
          stream_role: 'completion',
          project: 'controller-test',
          target_kind: 'gate',
          target_id: 'quality',
          gate_id: 'quality',
          gate_type: 'buster',
          run_id: completionIdentity.runId,
          attempt: completionIdentity.attempt,
          dispatch_id: completionIdentity.dispatchId,
          session_key: completionIdentity.sessionKey,
          gateway_label: completionIdentity.gateway_label,
          source: 'buster-pipeline',
          status: 'PASS',
          outcome: 'PASS',
          summary: 'gate passed',
          timestamp: '2026-05-11T00:00:00.000Z',
        }),
      },
    };
const config = {
    project: 'controller-test',
    paths: { swarm_dir: swarmDir },
      };
  const deps = {
    pollResult: testPollResult,
    _explicitDeps: configDeps2,
  };
  const result = await gateCompletion.waitBusterGateCompletionEvidence({
    deps,
    config,
    gateId: 'quality',
    gate: { type: 'buster', output_file: 'gates/quality-output.json' },
    completionIdentity,
    gateRateLimitStatusOptions: {},
    timeoutMinutes: 0.02,
  });
  assert.equal(result.ok, true, 'gate wrapper should map event-driven Redis PASS to a successful poll result');
  assert.equal(result.reason, 'target_reached');
  assert.equal(result.data._source, 'redis');
  assert.equal(result.data.dispatch_id, completionIdentity.dispatchId);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 90 }));
