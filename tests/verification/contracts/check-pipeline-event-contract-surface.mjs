import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-pipeline-event-contract-surface' });
import assert from 'assert';
import fs from 'fs';
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
const commonEventContractPath = path.join(sourceRoot, 'skills/common/pipeline/services/pipeline-event-contract.ts');
const novaEventContractShimPath = path.join(sourceRoot, 'skills/nova/pipeline/services/pipeline-event-contract.ts');
const busterEventContractShimPath = path.join(sourceRoot, 'skills/buster/pipeline/services/pipeline-event-contract.ts');
const lifecycleAuditPath = path.join(sourceRoot, 'tests/verification/lib/lifecycle-audit-lib.mjs');
const acpMonitorPath = path.join(sourceRoot, 'skills/common/pipeline/agents/acp-monitor.ts');
const timingPath = path.join(sourceRoot, 'skills/common/pipeline/timing.ts');
const approvalSignalAdapterPath = path.join(sourceRoot, 'skills/nova/pipeline/services/approval-signal-event-adapter.ts');

const commonSource = fs.readFileSync(commonEventContractPath, 'utf8');
const novaShimSource = fs.readFileSync(novaEventContractShimPath, 'utf8');
const busterShimSource = fs.readFileSync(busterEventContractShimPath, 'utf8');
const lifecycleAuditSource = fs.readFileSync(lifecycleAuditPath, 'utf8');

assert.equal(commonSource.includes("PIPELINE_EVENT_TYPES = Object.freeze(["), true, 'common event contract must own the pipeline event enum');
assert.equal(commonSource.includes("'completion.evidence'"), true, 'completion evidence event type must be defined');
assert.equal(commonSource.includes("'local.evidence.updated'"), true, 'local evidence event type must be defined');
assert.equal(commonSource.includes("'approval.signal'"), true, 'approval signal event type must be defined');
assert.equal(commonSource.includes("'fatal.error'"), true, 'fatal error event type must be defined');
assert.equal(commonSource.includes('export function validatePipelineEvent('), true, 'common event contract must own the event envelope validator');
assert.equal(commonSource.includes('export function validateApprovalSignalEventPayload('), true, 'common event contract must own the approval.signal payload validator');
assert.equal(commonSource.includes('export function normalizePipelineEventIdentity('), true, 'common event contract must own identity normalization');
assert.equal(commonSource.includes('export function createPipelineEventBus('), true, 'common event contract must own the in-process event bus factory');
assert.equal(commonSource.includes('export function waitForAny('), true, 'common event contract must own waitForAny');
assert.equal(commonSource.includes('validateAcpSessionStateEventPayload(event.payload)'), true, 'event contract must enforce ACP session payloads');
assert.equal(commonSource.includes('validateAcpTranscriptDeltaEventPayload(event.payload)'), true, 'event contract must enforce ACP transcript payloads');
assert.equal(commonSource.includes('validateApprovalSignalEventPayload(event.payload)'), true, 'event contract must enforce approval signal payloads');
assert.equal(commonSource.includes('assertAbortSignal(signal);'), true, 'event waits must require AbortSignal cleanup semantics');
assert.equal(novaShimSource.includes("../../../common/pipeline/services/pipeline-event-contract.ts"), true, 'Nova event contract shim must point at common owner');
assert.equal(busterShimSource.includes("../../../common/pipeline/services/pipeline-event-contract.ts"), true, 'Buster event contract shim must point at common owner');
assert.equal(lifecycleAuditSource.includes("'pipeline/services/pipeline-event-contract.ts'"), true, 'shared helper inventory must include the event contract shims');

const eventMod = await import(pathToFileURL(commonEventContractPath).href);
const acpMonitorMod = await import(pathToFileURL(acpMonitorPath).href);
const timingMod = await import(pathToFileURL(timingPath).href);
const approvalSignalAdapterMod = await import(pathToFileURL(approvalSignalAdapterPath).href);
const bus = eventMod.createPipelineEventBus();
eventMod.assertPipelineEventBusAdapter(bus);

const completionEvent = {
  schema_version: 'v1',
  type: 'completion.evidence',
  source: 'redis',
  identity: {
    module_id: '01',
    run_id: 'run-1',
    attempt: 2,
    dispatch_id: 'dispatch-1',
    session_key: 'agent:main:acp:session-1',
  },
  payload: {
    status: 'PASS',
    outcome: 'PASS',
    summary: 'module passed',
  },
  ts: '2026-05-11T00:00:00.000Z',
};

assert.deepEqual(eventMod.validatePipelineEvent(completionEvent, {
  requiredIdentityFields: ['module_id', 'run_id', 'attempt', 'dispatch_id'],
}), []);
assert.deepEqual(eventMod.normalizePipelineEventIdentity({
  moduleId: '01',
  runId: 'run-1',
  attempt: 2,
  dispatchId: 'dispatch-1',
  sessionKey: 'agent:main:acp:session-1',
}), {
  module_id: '01',
  run_id: 'run-1',
  attempt: '2',
  dispatch_id: 'dispatch-1',
  session_key: 'agent:main:acp:session-1',
});
assert.throws(
  () => eventMod.assertPipelineEvent({ ...completionEvent, type: 'unknown.event' }),
  (error) => error?.name === 'PipelineEventContractError'
    && error?.code === 'PIPELINE_EVENT_CONTRACT_INVALID'
    && error?.diagnostics?.validationErrors?.some((item) => item.includes('type must be one of')),
  'invalid event types should throw structured diagnostics',
);
assert.throws(
  () => eventMod.waitForEvent(bus, 'completion.evidence', { module_id: '01' }, {}),
  (error) => error?.name === 'PipelineEventContractError'
    && error?.code === 'PIPELINE_EVENT_CONTRACT_INVALID'
    && error?.message.includes('AbortSignal'),
  'waitForEvent should reject missing AbortSignal synchronously',
);

const approvalSignalEvent = {
  type: 'approval.signal',
  source: 'local_fs',
  identity: { gate_id: 'release-approval', run_id: 'run-approval-signal-1' },
  payload: {
    gate_id: 'release-approval',
    gate_type: 'approval',
    run_id: 'run-approval-signal-1',
    project: 'contract-approval-signal',
    wait_ref: 'wait:run-approval-signal-1:gate:release-approval:approval',
    status: 'APPROVED',
    signal_kind: 'approve',
    requested_at: '2026-05-13T00:00:00.000Z',
    deadline: '2026-05-13T01:00:00.000Z',
    timeout_minutes: 60,
    timeout_policy: 'BLOCK',
    resolved_at: '2026-05-13T00:01:00.000Z',
    decision_by: 'nova',
    decision_via: 'manual',
    continued: null,
    reason: 'approved',
    state_path: '/tmp/release-approval-gate-status.json',
    updated_at: '2026-05-13T00:01:00.000Z',
  },
};
assert.deepEqual(eventMod.validatePipelineEvent(approvalSignalEvent, { requiredIdentityFields: ['gate_id', 'run_id'] }), []);
assert.throws(
  () => eventMod.assertPipelineEvent({
    ...approvalSignalEvent,
    payload: { ...approvalSignalEvent.payload, legacy_status: 'APPROVED' },
  }),
  (error) => error?.name === 'PipelineEventContractError'
    && error?.diagnostics?.validationErrors?.some((item) => item.includes('payload.legacy_status is not allowed')),
  'approval.signal must reject undocumented payload fields synchronously',
);
assert.throws(
  () => eventMod.assertPipelineEvent({
    ...approvalSignalEvent,
    payload: { ...approvalSignalEvent.payload, status: 'WAITING_FOR_MAYBE' },
  }),
  (error) => error?.name === 'PipelineEventContractError'
    && error?.diagnostics?.validationErrors?.some((item) => item.includes('payload.status must be one of')),
  'approval.signal must reject unknown statuses synchronously',
);

{
  const controller = new AbortController();
  const waiter = eventMod.waitForEvent(bus, 'approval.signal', {
    gate_id: 'release-approval',
    run_id: 'run-approval-signal-1',
  }, { signal: controller.signal, timeoutMs: 1000 });
  bus.emit(approvalSignalEvent);
  const resolved = await waiter;
  assert.equal(resolved.type, 'approval.signal');
  assert.equal(resolved.payload.signal_kind, 'approve');
  assert.equal(bus.listenerCount(), 0, 'resolved approval.signal wait should remove its listener');
}

{
  const tmpRoot = fs.mkdtempSync(path.join('/tmp', 'approval-signal-adapter-contract-'));
  const swarmDir = path.join(tmpRoot, '.swarm');
  fs.mkdirSync(swarmDir, { recursive: true });
  const statePath = path.join(swarmDir, 'release-approval-gate-status.json');
  fs.writeFileSync(statePath, JSON.stringify({
    gate_id: 'release-approval',
    gate_type: 'approval',
    status: 'PENDING_APPROVAL',
    run_id: 'run-approval-adapter-1',
    project: 'contract-approval-signal-adapter',
    requested_at: '2026-05-13T00:00:00.000Z',
    deadline: '2026-05-13T01:00:00.000Z',
    timeout_minutes: 60,
    timeout_policy: 'BLOCK',
  }, null, 2));
  const adapterBus = eventMod.createPipelineEventBus();
  const adapter = approvalSignalAdapterMod.createApprovalSignalEventAdapter({
    paths: { swarm_dir: swarmDir },
    _runId: 'run-approval-adapter-1',
    project: 'contract-approval-signal-adapter',
  }, {
    eventBus: adapterBus,
    gateId: 'release-approval',
    gate: { type: 'approval' },
    debounceMs: 1,
    stopOnTerminal: true,
  });
  const controller = new AbortController();
  const waiter = adapterBus.waitForEvent('approval.signal', {
    gate_id: 'release-approval',
    run_id: 'run-approval-adapter-1',
  }, { signal: controller.signal, timeoutMs: 1000 });
  adapter.start();
  fs.writeFileSync(statePath, JSON.stringify({
    gate_id: 'release-approval',
    gate_type: 'approval',
    status: 'APPROVED',
    run_id: 'run-approval-adapter-1',
    project: 'contract-approval-signal-adapter',
    requested_at: '2026-05-13T00:00:00.000Z',
    deadline: '2026-05-13T01:00:00.000Z',
    timeout_minutes: 60,
    timeout_policy: 'BLOCK',
    resolved_at: '2026-05-13T00:02:00.000Z',
    decision_by: 'nova',
    decision_via: 'manual',
    reason: 'approved',
  }, null, 2));
  const resolved = await waiter;
  assert.equal(resolved.payload.status, 'APPROVED');
  assert.equal(resolved.payload.signal_kind, 'approve');
  assert.equal(adapter.watcherCount, 0, 'approval signal adapter must close watchers after terminal signal');
  assert.equal(adapter.pendingTimer, null, 'approval signal adapter must clear debounce timers after terminal signal');
}

const acpTranscript = {
  offset: 1,
  byteOffset: 99,
  eventCount: 1,
  lastEventTs: '2026-05-11T00:00:02.000Z',
  lastActivityPoll: 0,
  hardError: false,
  rateLimited: false,
  terminal: false,
  lastDetail: '',
  partialLine: '',
  newLines: ['{"kind":"assistant","text":"hi"}'],
};
const acpMonitorState = {
  sessionKey: 'agent:main:acp:session-acp',
  sessionState: 'running',
  sessionActive: true,
  transcript: acpTranscript,
  unknownPolls: 0,
  transcriptStalePolls: 0,
  gatewayUnreachable: false,
  gatewayDetail: null,
  terminal: false,
  rateLimited: false,
  reason: null,
  detail: 'running',
  lastDetail: 'running',
  lastSummary: 'running',
  failed: false,
  sessionTerminal: false,
  stopped: false,
};
const acpTranscriptEvent = {
  type: 'acp.transcript.delta',
  source: 'acp_gateway',
  identity: { module_id: 'acp', session_key: 'agent:main:acp:session-acp' },
  payload: {
    session_key: 'agent:main:acp:session-acp',
    new_lines: acpTranscript.newLines,
    line_count: 1,
    transcript_offset: 1,
    byte_offset: 99,
    transcript: acpTranscript,
    monitor_state: acpMonitorState,
  },
};
assert.deepEqual(eventMod.validatePipelineEvent(acpTranscriptEvent), []);
assert.equal('offset' in eventMod.assertPipelineEvent(acpTranscriptEvent).payload, false, 'canonical ACP transcript event must not expose legacy offset');
assert.throws(
  () => bus.emit({
    ...acpTranscriptEvent,
    payload: { ...acpTranscriptEvent.payload, offset: 1 },
  }),
  (error) => error?.name === 'PipelineEventContractError'
    && error?.code === 'PIPELINE_EVENT_CONTRACT_INVALID'
    && error?.diagnostics?.validationErrors?.some((item) => item.includes('payload.offset is not allowed')),
  'event bus should synchronously reject ACP transcript poison payloads with legacy offset',
);
assert.throws(
  () => bus.emit({
    type: 'acp.session.state',
    source: 'acp_gateway',
    identity: { module_id: 'acp', session_key: 'agent:main:acp:session-acp' },
    payload: {
      session_key: 'agent:main:acp:session-acp',
      session_state: 'running',
      session_active: 'yes',
      gateway_unreachable: false,
      gateway_detail: null,
      terminal: false,
      rate_limited: false,
      reason: null,
      detail: 'running',
      monitor_state: acpMonitorState,
    },
  }),
  (error) => error?.name === 'PipelineEventContractError'
    && error?.diagnostics?.validationErrors?.some((item) => item.includes('payload.session_active is invalid')),
  'event bus should synchronously reject malformed ACP session state payloads',
);

{
  const controller = new AbortController();
  const waiter = eventMod.waitForEvent(bus, 'completion.evidence', {
    module_id: '01',
    run_id: 'run-1',
    attempt: 2,
    dispatch_id: 'dispatch-1',
  }, { signal: controller.signal, timeoutMs: 1000 });
  assert.equal(bus.listenerCount(), 1, 'waiter should attach exactly one listener');
  bus.emit({ ...completionEvent, identity: { ...completionEvent.identity, module_id: '02' } });
  assert.equal(bus.listenerCount(), 1, 'non-matching identity should keep waiter active');
  const emitted = bus.emit(completionEvent);
  const resolved = await waiter;
  assert.equal(resolved.type, 'completion.evidence');
  assert.equal(resolved.identity.module_id, '01');
  assert.equal(emitted.identity.attempt, '2');
  assert.equal(bus.listenerCount(), 0, 'resolved wait should remove its listener');
}

{
  const controller = new AbortController();
  const waiter = eventMod.waitForAny(bus, ['completion.evidence', 'local.evidence.updated'], {
    module_id: '03',
    run_id: 'run-3',
  }, { signal: controller.signal, timeoutMs: 1000 });
  bus.emit({
    type: 'local.evidence.updated',
    source: 'local_fs',
    identity: { module_id: '03', run_id: 'run-3' },
    payload: { path: '.swarm/modules/03/buster-result.json' },
    ts: '2026-05-11T00:00:01.000Z',
  });
  const resolved = await waiter;
  assert.equal(resolved.type, 'local.evidence.updated');
  assert.equal(bus.listenerCount(), 0, 'waitForAny should remove its listener after first matching event');
}

{
  const controller = new AbortController();
  const waiter = eventMod.waitForEvent(bus, 'completion.evidence', { module_id: '04' }, {
    signal: controller.signal,
    timeoutMs: 1000,
  });
  assert.equal(bus.listenerCount(), 1);
  controller.abort();
  await assert.rejects(
    waiter,
    (error) => error?.name === 'PipelineEventWaitAbortedError'
      && error?.code === 'PIPELINE_EVENT_WAIT_ABORTED'
      && error?.diagnostics?.identity?.module_id === '04',
    'abort should reject with structured wait-aborted diagnostics',
  );
  assert.equal(bus.listenerCount(), 0, 'aborted wait should remove its listener');
}

{
  const controller = new AbortController();
  await assert.rejects(
    eventMod.waitForEvent(bus, 'completion.evidence', { module_id: '05' }, {
      signal: controller.signal,
      timeoutMs: 5,
    }),
    (error) => error?.name === 'PipelineEventWaitTimeoutError'
      && error?.code === 'PIPELINE_EVENT_WAIT_TIMEOUT'
      && error?.diagnostics?.identity?.module_id === '05',
    'timeout should reject with structured timeout diagnostics',
  );
  assert.equal(bus.listenerCount(), 0, 'timed-out wait should remove its listener');
}


class CountingAbortSignal {
  constructor({ aborted = false } = {}) {
    this.aborted = aborted;
    this.addCount = 0;
    this.removeCount = 0;
    this._listeners = new Set();
  }

  addEventListener(type, listener) {
    if (type !== 'abort') return;
    this.addCount += 1;
    this._listeners.add(listener);
  }

  removeEventListener(type, listener) {
    if (type !== 'abort') return;
    this.removeCount += 1;
    this._listeners.delete(listener);
  }

  abort() {
    this.aborted = true;
    for (const listener of [...this._listeners]) listener();
  }

  listenerCount() { return this._listeners.size; }
}

{
  const signal = new CountingAbortSignal({ aborted: true });
  await assert.rejects(
    eventMod.waitForAny(bus, ['completion.evidence', 'local.evidence.updated'], { module_id: 'pre-abort' }, {
      signal,
      timeoutMs: 1000,
    }),
    (error) => error?.name === 'PipelineEventWaitAbortedError'
      && error?.diagnostics?.identity?.module_id === 'pre-abort',
    'already-aborted signals should reject before attaching listeners',
  );
  assert.equal(signal.addCount, 0, 'already-aborted signal should not attach an abort listener');
  assert.equal(bus.listenerCount(), 0, 'already-aborted waitForAny should not attach bus listeners');
}

{
  const signal = new CountingAbortSignal();
  const waiter = eventMod.waitForAny(bus, ['completion.evidence', 'local.evidence.updated'], {
    module_id: 'race-module',
    run_id: 'race-run',
  }, { signal, timeoutMs: 1000 });
  assert.equal(signal.addCount, 1, 'waitForAny should attach exactly one abort listener');
  assert.equal(bus.listenerCount(), 1, 'waitForAny race should attach one bus listener');
  bus.emit({
    type: 'completion.evidence',
    source: 'redis',
    identity: { module_id: 'race-module', run_id: 'race-run' },
    payload: { status: 'PASS' },
  });
  bus.emit({
    type: 'local.evidence.updated',
    source: 'local_fs',
    identity: { module_id: 'race-module', run_id: 'race-run' },
    payload: { paths: ['should-not-win'] },
  });
  const resolved = await waiter;
  assert.equal(resolved.type, 'completion.evidence', 'waitForAny should resolve with the first matching race event');
  assert.equal(signal.removeCount, 1, 'resolved waitForAny should remove its abort listener');
  assert.equal(signal.listenerCount(), 0, 'resolved waitForAny should leave no abort listeners');
  assert.equal(bus.listenerCount(), 0, 'resolved waitForAny should leave no bus listeners');
}

{
  const signal = new CountingAbortSignal();
  await assert.rejects(
    eventMod.waitForAny(bus, ['completion.evidence', 'fatal.error'], { module_id: 'timeout-any' }, {
      signal,
      timeoutMs: 5,
    }),
    (error) => error?.name === 'PipelineEventWaitTimeoutError'
      && error?.code === 'PIPELINE_EVENT_WAIT_TIMEOUT'
      && error?.diagnostics?.types?.includes('fatal.error')
      && error?.diagnostics?.identity?.module_id === 'timeout-any',
    'waitForAny timeout should reject with structured timeout diagnostics',
  );
  assert.equal(signal.removeCount, 1, 'timed-out waitForAny should remove its abort listener');
  assert.equal(signal.listenerCount(), 0, 'timed-out waitForAny should leave no abort listeners');
  assert.equal(bus.listenerCount(), 0, 'timed-out waitForAny should remove bus listener');
}

{
  const signal = new CountingAbortSignal();
  const waiter = eventMod.waitForAny(bus, ['completion.evidence', 'fatal.error'], { module_id: 'abort-any' }, {
    signal,
    timeoutMs: 1000,
  });
  assert.equal(bus.listenerCount(), 1);
  signal.abort();
  await assert.rejects(
    waiter,
    (error) => error?.name === 'PipelineEventWaitAbortedError'
      && error?.diagnostics?.types?.includes('completion.evidence')
      && error?.diagnostics?.identity?.module_id === 'abort-any',
    'waitForAny abort should reject with structured abort diagnostics',
  );
  assert.equal(signal.removeCount, 1, 'aborted waitForAny should remove its abort listener');
  assert.equal(signal.listenerCount(), 0, 'aborted waitForAny should leave no abort listeners');
  assert.equal(bus.listenerCount(), 0, 'aborted waitForAny should remove bus listener');
}


{
  const acpBus = eventMod.createPipelineEventBus();
  const budget = timingMod.createBudget({ timeoutMs: 80, label: 'adapter-diff-test' });
  let calls = 0;
  const states = [
    { sessionState: 'running', sessionActive: true, terminal: false, transcript: { newLines: [] } },
    { sessionState: 'running', sessionActive: true, terminal: false, transcript: { newLines: [] } },
    { sessionState: 'running', sessionActive: true, terminal: false, transcript: { newLines: ['{"kind":"assistant","text":"hi"}'], offset: 1 } },
    { sessionState: 'closed', sessionActive: false, terminal: true, reason: 'session_terminal', transcript: { newLines: [] } },
  ];
  const adapter = acpMonitorMod.createAcpMonitorEventAdapter('session-diff', null, {
    eventBus: acpBus,
    identity: { module_id: 'diff', session_key: 'session-diff' },
    budget,
    pollMs: 1,
    monitorOpts: {
      unknown_poll_limit: 1,
      stale_poll_limit: 1,
      max_transcript_extensions: 0,
      transcript_grace_ms: 0,
      monitor_poll_ms: 1,
    },
    getAcpMonitorState: async (request) => {
      assert.equal(request.childSessionKey, 'session-diff');
      assert.equal(Object.prototype.hasOwnProperty.call(request, 'previousState'), true);
      const base = states[Math.min(calls, states.length - 1)];
      calls += 1;
      return {
        sessionKey: 'session-diff',
        unknownPolls: 0,
        transcriptStalePolls: 0,
        gatewayUnreachable: false,
        gatewayDetail: null,
        rateLimited: false,
        reason: null,
        detail: base.sessionState,
        lastDetail: base.sessionState,
        lastSummary: base.sessionState,
        failed: false,
        sessionTerminal: base.terminal,
        stopped: !base.sessionActive,
        ...base,
        transcript: {
          offset: 0,
          byteOffset: 0,
          eventCount: 0,
          lastEventTs: null,
          lastActivityPoll: 0,
          hardError: false,
          rateLimited: false,
          terminal: false,
          lastDetail: '',
          partialLine: '',
          ...base.transcript,
        },
      };
    },
  });

  adapter.start();
  const first = await eventMod.waitForEvent(acpBus, 'acp.session.state', { module_id: 'diff' }, {
    signal: budget.signal,
    budget,
    timeoutMs: 50,
  });
  assert.equal(first.payload.session_state, 'running');
  const delta = await eventMod.waitForEvent(acpBus, 'acp.transcript.delta', { module_id: 'diff' }, {
    signal: budget.signal,
    budget,
    timeoutMs: 50,
  });
  assert.equal(delta.payload.line_count, 1, 'adapter should emit transcript deltas only when new lines arrive');
  assert.equal(delta.payload.transcript_offset, 1, 'adapter should emit canonical transcript_offset');
  assert.equal('offset' in delta.payload, false, 'adapter should not emit legacy offset field');
  const terminal = await eventMod.waitForEvent(acpBus, 'acp.session.state', { module_id: 'diff' }, {
    signal: budget.signal,
    budget,
    timeoutMs: 50,
  });
  assert.equal(terminal.payload.session_state, 'closed');
  const done = await adapter.done;
  assert.equal(done.reason, 'completed');
  assert.equal(acpBus.listenerCount(), 0, 'ACP adapter waits should leave no event listeners');
}

{
  const acpBus = eventMod.createPipelineEventBus();
  const budget = timingMod.createBudget({ timeoutMs: 5, label: 'adapter-budget-test' });
  let calls = 0;
  const adapter = acpMonitorMod.createAcpMonitorEventAdapter('session-budget', null, {
    eventBus: acpBus,
    identity: { module_id: 'budget', session_key: 'session-budget' },
    budget,
    pollMs: 10,
    monitorOpts: {
      unknown_poll_limit: 1,
      stale_poll_limit: 1,
      max_transcript_extensions: 0,
      transcript_grace_ms: 0,
      monitor_poll_ms: 10,
    },
    getAcpMonitorState: async () => {
      calls += 1;
      return {
        sessionKey: 'session-budget',
        sessionState: 'running',
        sessionActive: true,
        transcript: {
          offset: 0,
          byteOffset: 0,
          eventCount: 0,
          lastEventTs: null,
          lastActivityPoll: 0,
          hardError: false,
          rateLimited: false,
          terminal: false,
          lastDetail: '',
          partialLine: '',
          newLines: [],
        },
        unknownPolls: 0,
        transcriptStalePolls: 0,
        gatewayUnreachable: false,
        gatewayDetail: null,
        terminal: false,
        rateLimited: false,
        reason: null,
        detail: 'running',
        lastDetail: 'running',
        lastSummary: 'running',
        failed: false,
        sessionTerminal: false,
        stopped: false,
      };
    },
  });
  const done = await adapter.start();
  assert.equal(done.reason, 'budget_exhausted', 'ACP adapter should stop on shared budget exhaustion');
  assert(calls >= 1, 'ACP adapter should perform the initial edge observation before budget sleep exhaustion');
}

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 65 }));
