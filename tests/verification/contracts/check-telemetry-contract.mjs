#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';
import { pathToFileURL } from 'url';
import {
  assertTelemetrySchemaHotspotAuthority,
  parseArgs,
  resolveRoots,
  resolveTelemetryContractPath,
  materializeRuntimeTree,
  importRuntimeModule,
  ensureDir,
  extractContractEventNames,
  extractTelemetrySchemaEventNames,
  collectEmitEventNames,
  effectiveFiles,
} from '../lib/lifecycle-audit-lib.mjs';

const args = parseArgs();
const { sourceRoot, overlayRoot } = resolveRoots(args);
const contractPath = resolveTelemetryContractPath(args, sourceRoot);

function installFakeRedis(runtimeRoot) {
  const nodeModulesDir = ensureDir(path.join(runtimeRoot, 'node_modules', 'ioredis'));
  fs.writeFileSync(path.join(nodeModulesDir, 'index.js'), `
let counters = globalThis.__fakeRedisCounters ||= Object.create(null);
let calls = globalThis.__fakeRedisCalls ||= [];
class FakeRedis {
  constructor() {
    this.status = 'ready';
  }
  on() {}
  async incr(key) {
    counters[key] = (counters[key] || 0) + 1;
    calls.push({ op: 'incr', key, value: counters[key] });
    return counters[key];
  }
  async xadd(...args) {
    calls.push({ op: 'xadd', args });
    return '1-0';
  }
  async expire(...args) {
    calls.push({ op: 'expire', args });
    return 1;
  }
  multi() {
    const ops = [];
    const chain = {
      xadd: (...args) => { ops.push({ op: 'xadd', args }); return chain; },
      expire: (...args) => { ops.push({ op: 'expire', args }); return chain; },
      exec: async () => { calls.push(...ops); return ops; },
    };
    return chain;
  }
  async quit() { calls.push({ op: 'quit' }); }
}
module.exports = FakeRedis;
`);
  fs.writeFileSync(path.join(nodeModulesDir, 'package.json'), '{"name":"ioredis","main":"index.js"}');
}

async function importFresh(runtimeRoot, runtimePath) {
  const href = pathToFileURL(path.join(runtimeRoot, runtimePath.replace(/^\//, ''))).href;
  return import(`${href}?fresh=${Date.now()}-${Math.random()}`);
}

function xaddEvents(prefix) {
  const calls = globalThis.__fakeRedisCalls || [];
  return calls
    .filter((entry) => entry.op === 'xadd' && String(entry.args?.[0] || '').startsWith(prefix))
    .map((entry) => {
      const dataIndex = entry.args.indexOf('data');
      return JSON.parse(entry.args[dataIndex + 1]);
    });
}

async function flushAsync() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function buildBuiltInRegistry(runtimeRoot) {
  const registryMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/registry.js');
  const { registry, errors } = registryMod.buildPluginRegistry({}, { throwOnError: false });
  assert.equal(errors.length, 0);
  return registry;
}

const contractEvents = extractContractEventNames(contractPath);
const contractText = fs.readFileSync(contractPath, 'utf8');
const telemetrySchemaPath = path.join(sourceRoot, 'docs', 'telemetry-event-schema.md');
const telemetrySchemaEvents = extractTelemetrySchemaEventNames(telemetrySchemaPath);
const missingSchemaEvents = [...contractEvents].filter((name) => !telemetrySchemaEvents.has(name)).sort();
const staleSchemaEvents = [...telemetrySchemaEvents].filter((name) => !contractEvents.has(name)).sort();
assert.equal(
  missingSchemaEvents.length,
  0,
  `Telemetry schema missing canonical event sections: ${missingSchemaEvents.join(', ')}`,
);
assert.equal(
  staleSchemaEvents.length,
  0,
  `Telemetry schema documents non-canonical event sections: ${staleSchemaEvents.join(', ')}`,
);
const legacyBusterRunScopedStream = ['buster', 'telemetry:<project>:<run_id>'].join(':');
assert.equal(
  contractText.includes(legacyBusterRunScopedStream),
  false,
  'telemetry contract must not preserve the stale legacy Buster run-scoped stream literal',
);
assert.equal(
  contractText.includes(`canonical Buster stream key is \`${legacyBusterRunScopedStream}\``),
  false,
  'telemetry contract must not describe the legacy Buster run-scoped stream as canonical live ownership',
);
assert.equal(
  contractText.includes(`canonical runtime side: \`${legacyBusterRunScopedStream}\` with flat envelopes`),
  false,
  'telemetry contract compatibility notes must not describe the legacy Buster run-scoped stream as canonical runtime ownership',
);
assert.equal(
  contractText.includes('`pipeline:telemetry:<project>:<run_id>` is the single canonical live stream'),
  true,
  'telemetry contract must state that pipeline:telemetry:<project>:<run_id> is the single canonical live stream',
);
assert.equal(
  contractText.includes('This contract is the authoritative owner of:'),
  true,
  'telemetry contract must explicitly own canonical inventory and contract boundaries',
);
assert.equal(
  contractText.includes('`docs/telemetry-event-schema.md` is the authoritative event-by-event payload reference for those canonical event names, including authoritative field tables, payload examples, and event-specific correlation notes.'),
  true,
  'telemetry contract must explicitly defer event-by-event payload reference ownership to telemetry-event-schema.md',
);
assert.equal(
  contractText.includes('`summary.started`'),
  true,
  'telemetry contract must preserve summary.started as a canonical summary lifecycle event name',
);
assert.equal(
  contractText.includes('`summary.completed`'),
  true,
  'telemetry contract must preserve summary.completed as a canonical summary lifecycle event name',
);
const legacyCaseStudyStartedEvent = ['case_study', 'started'].join('.');
assert.equal(
  contractText.includes(legacyCaseStudyStartedEvent),
  false,
  'telemetry contract must not preserve the stale case-study started event name as canonical ownership',
);
const legacyCaseStudyCompletedEvent = ['case_study', 'completed'].join('.');
assert.equal(
  contractText.includes(legacyCaseStudyCompletedEvent),
  false,
  'telemetry contract must not preserve the stale case-study completed event name as canonical ownership',
);
assert.equal(
  contractText.includes('For `summary_type: pipeline`, the canonical live payload also preserves `exit_code`, `exit_reason`, `summary_json_path`, `pipeline_summary_path`, and `latest_json_path`'),
  true,
  'telemetry contract must document pipeline summary artifact correlation fields',
);
assert.equal(
  contractText.includes('.swarm/logs/redis/redis-exchanges.jsonl'),
  true,
  'telemetry contract must document the canonical project-level Redis exchanges audit artifact path .swarm/logs/redis/redis-exchanges.jsonl',
);
assert.equal(
  contractText.includes('.swarm/logs/redis/redis-ops.jsonl'),
  true,
  'telemetry contract must document the canonical project-level Redis ops audit artifact path .swarm/logs/redis/redis-ops.jsonl',
);
assert.equal(
  contractText.includes('.swarm/logs/pipeline/runs/<run_id>/redis/redis-exchanges.jsonl'),
  true,
  'telemetry contract must document the canonical run-scoped Redis exchanges audit artifact path .swarm/logs/pipeline/runs/<run_id>/redis/redis-exchanges.jsonl',
);
assert.equal(
  contractText.includes('.swarm/logs/pipeline/runs/<run_id>/redis/redis-ops.jsonl'),
  true,
  'telemetry contract must document the canonical run-scoped Redis ops audit artifact path .swarm/logs/pipeline/runs/<run_id>/redis/redis-ops.jsonl',
);
const emitted = new Set();
for (const relDir of ['skills/buster', 'skills/nova/pipeline']) {
  const files = effectiveFiles(sourceRoot, overlayRoot, relDir);
  for (const [relPath, absPath] of files.entries()) {
    if (!relPath.endsWith('.js')) continue;
    for (const name of collectEmitEventNames(absPath)) emitted.add(name);
  }
}
const busterPipelineText = fs.readFileSync(path.join(sourceRoot, 'skills', 'buster', 'buster-pipeline.js'), 'utf8');
assert.equal(busterPipelineText.includes("await emitEvent(tctx, 'agent.spawned'"), true, 'Buster task orchestration must emit agent.spawned for child sessions');
assert.equal(busterPipelineText.includes("await emitEvent(tctx, 'agent.killed'"), true, 'Buster task orchestration must emit agent.killed for child sessions');

const unknownEvents = [...emitted].filter((name) => !contractEvents.has(name)).sort();
assert.equal(unknownEvents.length, 0, `Unknown telemetry event names: ${unknownEvents.join(', ')}`);

const staleContractEvents = [...contractEvents]
  .filter((name) => !emitted.has(name))
  .sort();
assert.equal(staleContractEvents.length, 0, `Contract-only telemetry event names: ${staleContractEvents.join(', ')}`);

const sharedRunId = 'run-1';
const sharedStreamKey = 'pipeline:telemetry:proj:run-1';

const { runtimeRoot: sandboxRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
installFakeRedis(sandboxRoot);
const busterTelemetry = await importRuntimeModule(sandboxRoot, '/app/skills/pipeline/services/telemetry.js');
const busterCtxA = busterTelemetry.createTelemetryContext({
  project: 'proj',
  module: 'mod-a',
  runId: sharedRunId,
  enabled: true,
});
assert.equal(busterCtxA.streamKey, sharedStreamKey);

await busterTelemetry.emitEvent(busterCtxA, 'buster.task_started', { module_id: 'mod-a', attempt: 1 });
await busterTelemetry.emitEvent(busterCtxA, 'buster.task_completed', { module_id: 'mod-a', outcome: 'PASS' });
const busterCtxB = busterTelemetry.createTelemetryContext({
  project: 'proj',
  module: 'mod-a',
  runId: sharedRunId,
  streamKey: 'legacy:module-stream',
  enabled: true,
});
assert.equal(busterCtxB.streamKey, sharedStreamKey);
await busterTelemetry.emitEvent(busterCtxB, 'buster.session_monitor', { module_id: 'mod-a', elapsed_seconds: 3 });
await busterTelemetry.closeTelemetry(busterCtxA);
await busterTelemetry.closeTelemetry(busterCtxB);

const { runtimeRoot: generalRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
installFakeRedis(generalRoot);
const runtimeCore = await importRuntimeModule(generalRoot, '/app/skills/pipeline/core/runtime.js');
const builtInRegistry = await buildBuiltInRegistry(generalRoot);
const config = {
  project: 'proj',
  telemetry: { enabled: true, stream_key: 'legacy:custom-stream' },
  gates: { 'gate:quality': { type: 'review', title: 'Quality' } },
  compatibility: { legacy_module_status_bootstrap_mode: 'migration_only' },
  resume: false,
  nova_prompt: 'do the thing',
  _pluginRegistry: builtInRegistry,
};
config._runId = sharedRunId;
config.run_id = sharedRunId;
config._runStats = runtimeCore.createRunStats('2026-04-09T00:00:00.000Z');
config._runStats.modules_completed.push('mod-a');
config._runStats.modules_failed.push('mod-b');
config._runStats.modules_blocked.push('mod-c');
const ctx = { config };

const progress = {
  modules: {
    'mod-a': { title: 'Module A', dir: 'mods/a', depends_on: [] },
  },
  gates: {
    'gate:quality': { type: 'review', title: 'Quality' },
  },
  execution_order: ['mod-a'],
  models: { forge: 'openai/gpt-5' },
};

const novaTelemetryA = await importFresh(generalRoot, '/app/skills/pipeline/services/telemetry.js');
novaTelemetryA.onPipelineStarted(ctx, progress);
novaTelemetryA.emitCostUpdate(ctx, {
  module_id: 'mod-a',
  agent_type: 'forge',
  label: 'forge-mod-a',
  cost_usd: 0.12,
  total_cost_usd: 0.32,
  input_tokens: 123,
  output_tokens: 45,
  model: 'openai/gpt-5',
});
novaTelemetryA.onPipelineHalted(ctx, 'mod-b', 42, 'BLOCKED');
novaTelemetryA.onRetryScheduled(ctx, 'mod-a', {
  attempt: 2,
  max_attempts: 5,
  delay_seconds: 30,
  reason: 'rate limit retry',
});
novaTelemetryA.onBudgetWarning(ctx, 'tokens', 80, 100, 'tokens');
novaTelemetryA.onApprovalRequested(ctx, 'gate:quality', 'Quality', 15, 'BLOCK', { gate_type: 'approval' });
novaTelemetryA.emitRateLimitDetected(ctx, {
  module_id: 'mod-a',
  session_key: 'agent:forge:mod-a',
  agent_type: 'forge',
  attempt: 2,
  provider: 'anthropic',
  cooldown_ms: 120000,
  pause_count: 2,
  max_pauses: 5,
  detail: '429 Too Many Requests',
});
novaTelemetryA.emitRateLimitDetected(ctx, {
  module_id: null,
  gate_id: 'gate:review',
  gate_type: 'review',
  session_key: 'agent:echo:gate-review',
  dispatch_id: 'dispatch-review-06-2',
  agent_type: 'echo',
  attempt: 1,
  provider: 'anthropic',
  cooldown_ms: 30000,
  pause_count: 1,
  max_pauses: 2,
  detail: 'Review gate rate limit',
});
novaTelemetryA.onGatePass(ctx, 'gate:dispatch', {
  gate_type: 'buster',
  dispatch_id: 'dispatch-gate-contract-1',
  session_key: 'agent:buster:gate-contract-1',
  duration_seconds: 12,
});
novaTelemetryA.onRetryExhausted(ctx, 'gate:dispatch', {
  gate_id: 'gate:dispatch',
  gate_type: 'buster',
  phase: 'buster_gate',
  attempt: 2,
  dispatch_id: 'dispatch-gate-contract-1',
  session_key: 'agent:buster:gate-contract-1',
  reason: 'dispatch exhausted',
  max_attempts: 2,
  max_fails: 2,
});
novaTelemetryA.emitTranscriptLine(ctx, {
  agent_type: 'echo',
  label: 'echo-review-06',
  module_id: null,
  gate_id: 'gate:review',
  gate_type: 'review',
  session_key: 'agent:echo:gate-review',
  dispatch_id: 'dispatch-review-06-2',
  line_kind: 'assistant',
  text: 'Reviewing gate feedback now',
  transcript_offset: 42,
});
novaTelemetryA.emitAgentProgress(ctx, {
  agent_type: 'echo',
  label: 'echo-review-06',
  module_id: null,
  gate_id: 'gate:review',
  gate_type: 'review',
  session_key: 'agent:echo:gate-review',
  dispatch_id: 'dispatch-review-06-2',
  elapsed_seconds: 15,
  transcript_events: 3,
  last_activity: 'Reviewing gate feedback now',
  status: 'active',
});
novaTelemetryA.emitObservabilityDegraded(ctx, {
  component: 'acp_monitor',
  surface: 'gateway',
  reason: 'gateway_unreachable',
  detail: 'session status unreachable',
  module_id: 'mod-a',
  gateway_label: 'forge-mod-a',
  session_key: 'agent:forge:mod-a',
  attempt: 2,
  dispatch_id: 'dispatch-mod-a-2',
  agent_type: 'forge',
  degraded_at: '2026-04-09T00:01:00.000Z',
});
novaTelemetryA.emitObservabilityRestored(ctx, {
  component: 'acp_monitor',
  surface: 'gateway',
  reason: 'gateway_unreachable',
  detail: 'session status reachable again',
  module_id: 'mod-a',
  gateway_label: 'forge-mod-a',
  session_key: 'agent:forge:mod-a',
  attempt: 2,
  dispatch_id: 'dispatch-mod-a-2',
  agent_type: 'forge',
  degraded_at: '2026-04-09T00:01:00.000Z',
  restored_at: '2026-04-09T00:02:00.000Z',
  restored_after_ms: 60000,
});
await flushAsync();
await novaTelemetryA.closeTelemetryRedis();

const novaTelemetryB = await importFresh(generalRoot, '/app/skills/pipeline/services/telemetry.js');
novaTelemetryB.onPipelineCompleted(ctx, 0, 'OK', { total_cost_usd: 0.32 });
await flushAsync();
await novaTelemetryB.closeTelemetryRedis();

const pipelineEvents = xaddEvents(sharedStreamKey);
assert.equal(pipelineEvents.length, 18, 'expected eighteen telemetry xadd operations on the shared run stream');
assert.deepEqual(pipelineEvents.map((event) => event.seq), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
assert.equal(xaddEvents('legacy:custom-stream').length, 0, 'telemetry.stream_key must not create a non-canonical stream family');
assert(pipelineEvents.every((event) => event.v === 1), 'all telemetry events must set v=1');
assert(pipelineEvents.every((event) => event.project === 'proj' && event.run_id === sharedRunId));

const busterEvents = pipelineEvents.filter((event) => event.source === 'buster');
assert.equal(busterEvents.length, 3, 'expected three Buster telemetry events on the shared run stream');
assert.deepEqual(busterEvents.map((event) => event.seq), [1, 2, 3]);
assert(busterEvents.every((event) => event.emitter === 'buster/pipeline/services/telemetry'));
assert(busterEvents.every((event) => event.module_id === 'mod-a'));
assert(busterEvents.every((event) => !Object.prototype.hasOwnProperty.call(event, 'data')), 'Buster telemetry payload must be flat, not nested under data');
assert.equal(busterEvents[0].type, 'buster.task_started');
assert.equal(busterEvents[1].type, 'buster.task_completed');
assert.equal(busterEvents[2].type, 'buster.session_monitor');

const novaEvents = pipelineEvents.filter((event) => event.source === 'pipeline');
assert.equal(novaEvents.length, 15, 'expected fifteen Nova telemetry events on the shared run stream');
assert.deepEqual(novaEvents.map((event) => event.seq), [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
assert(novaEvents.every((event) => event.emitter === 'nova/pipeline/services/telemetry'));

const completed = pipelineEvents.find((event) => event.type === 'pipeline.completed');
assert(completed, 'missing pipeline.completed event');
assert.equal(completed.modules_passed, 1);
assert.equal(completed.modules_failed, 1);
assert.equal(completed.modules_total, 3);
assert.equal(completed.total_cost_usd, 0.32);

const halted = pipelineEvents.find((event) => event.type === 'pipeline.halted');
assert(halted, 'missing pipeline.halted event');
assert.equal(halted.reason, 'BLOCKED');
assert.equal(halted.module_id, 'mod-b');
assert.equal(halted.exit_code, 42);
assert(!Object.prototype.hasOwnProperty.call(halted, 'halted_at_module'));
assert(!Object.prototype.hasOwnProperty.call(halted, 'halted_at_gate'));

const retry = pipelineEvents.find((event) => event.type === 'retry.scheduled');
assert(retry, 'missing retry.scheduled event');
assert.equal(retry.attempt, 2);
assert.equal(retry.max_attempts, 5);
assert.equal(retry.delay_seconds, 30);
assert.equal(retry.reason, 'rate limit retry');

const cost = pipelineEvents.find((event) => event.type === 'cost.update');
assert(cost, 'missing cost.update event');
assert.equal(cost.cost_usd, 0.12);
assert.equal(cost.total_cost_usd, 0.32);
assert.equal(cost.input_tokens, 123);
assert.equal(cost.output_tokens, 45);

const budget = pipelineEvents.find((event) => event.type === 'budget.warning');
assert(budget, 'missing budget.warning event');
assert.equal(budget.current_cost_usd, null);
assert.equal(budget.budget_usd, null);
assert.equal(budget.percent_used, 80);
assert.equal(budget.threshold, 'tokens');
assert.equal(budget.current, 80);
assert.equal(budget.limit, 100);
assert.equal(budget.unit, 'tokens');

const approval = pipelineEvents.find((event) => event.type === 'approval.requested');
assert(approval, 'missing approval.requested event');
assert.equal(approval.approval_id, 'gate:quality');
assert.equal(approval.gate_id, 'gate:quality');
assert.equal(approval.gate_type, 'approval');
assert.equal(approval.gate_title, 'Quality');
assert.equal(approval.timeout_minutes, 15);
assert.equal(approval.timeout_policy, 'BLOCK');
assert.deepEqual(approval.options, ['APPROVE', 'REJECT']);

const rateLimit = pipelineEvents.find((event) => event.type === 'rate_limit.detected' && event.module_id === 'mod-a');
assert(rateLimit, 'missing rate_limit.detected event');
assert.equal(rateLimit.session_key, 'agent:forge:mod-a');
assert.equal(rateLimit.attempt, 2);
assert.equal(rateLimit.retry_after_seconds, 120);
assert.equal(rateLimit.pause_count, 2);
assert.equal(rateLimit.max_pauses, 5);

const gateRateLimit = pipelineEvents.find((event) => event.type === 'rate_limit.detected' && event.gate_id === 'gate:review');
assert(gateRateLimit, 'missing gate rate_limit.detected event');
assert.equal(gateRateLimit.module_id, null);
assert.equal(gateRateLimit.gate_type, 'review');
assert.equal(gateRateLimit.session_key, 'agent:echo:gate-review');
assert.equal(gateRateLimit.attempt, 1);
assert.equal(gateRateLimit.dispatch_id, 'dispatch-review-06-2');
assert.equal(gateRateLimit.retry_after_seconds, 30);
assert.equal(gateRateLimit.pause_count, 1);
assert.equal(gateRateLimit.max_pauses, 2);

const gateVerdictWithDispatch = pipelineEvents.find((event) => event.type === 'gate.verdict' && event.gate_id === 'gate:dispatch');
assert(gateVerdictWithDispatch, 'missing gate.verdict dispatch correlation event');
assert.equal(gateVerdictWithDispatch.dispatch_id, 'dispatch-gate-contract-1');
assert.equal(gateVerdictWithDispatch.session_key, 'agent:buster:gate-contract-1');
assert.equal(gateVerdictWithDispatch.verdict, 'GO');

const gateRetryExhaustedWithDispatch = pipelineEvents.find((event) => event.type === 'retry.exhausted' && event.gate_id === 'gate:dispatch');
assert(gateRetryExhaustedWithDispatch, 'missing retry.exhausted dispatch correlation event');
assert.equal(gateRetryExhaustedWithDispatch.gate_type, 'buster');
assert.equal(gateRetryExhaustedWithDispatch.dispatch_id, 'dispatch-gate-contract-1');
assert.equal(gateRetryExhaustedWithDispatch.session_key, 'agent:buster:gate-contract-1');
assert.equal(gateRetryExhaustedWithDispatch.phase, 'buster_gate');

const transcript = pipelineEvents.find((event) => event.type === 'agent.transcript');
assert(transcript, 'missing agent.transcript event');
assert.equal(transcript.gate_id, 'gate:review');
assert.equal(transcript.gate_type, 'review');
assert.equal(transcript.dispatch_id, 'dispatch-review-06-2');
assert.equal(transcript.session_key, 'agent:echo:gate-review');

const progressEvent = pipelineEvents.find((event) => event.type === 'agent.progress');
assert(progressEvent, 'missing agent.progress event');
assert.equal(progressEvent.gate_id, 'gate:review');
assert.equal(progressEvent.gate_type, 'review');
assert.equal(progressEvent.dispatch_id, 'dispatch-review-06-2');
assert.equal(progressEvent.session_key, 'agent:echo:gate-review');

const observabilityDegraded = pipelineEvents.find((event) => event.type === 'observability.degraded');
assert(observabilityDegraded, 'missing observability.degraded event');
assert.equal(observabilityDegraded.component, 'acp_monitor');
assert.equal(observabilityDegraded.surface, 'gateway');
assert.equal(observabilityDegraded.reason, 'gateway_unreachable');
assert.equal(observabilityDegraded.gateway_label, 'forge-mod-a');
assert.equal(observabilityDegraded.session_key, 'agent:forge:mod-a');
assert.equal(observabilityDegraded.attempt, 2);
assert.equal(observabilityDegraded.dispatch_id, 'dispatch-mod-a-2');

const observabilityRestored = pipelineEvents.find((event) => event.type === 'observability.restored');
assert(observabilityRestored, 'missing observability.restored event');
assert.equal(observabilityRestored.component, 'acp_monitor');
assert.equal(observabilityRestored.surface, 'gateway');
assert.equal(observabilityRestored.gateway_label, 'forge-mod-a');
assert.equal(observabilityRestored.attempt, 2);
assert.equal(observabilityRestored.dispatch_id, 'dispatch-mod-a-2');
assert.equal(observabilityRestored.restored_after_ms, 60000);

const failuresMod = await importFresh(generalRoot, '/app/skills/pipeline/services/failures.js');
const statusStoreMod = await importFresh(generalRoot, '/app/skills/pipeline/services/status-store.js');
const failureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'check-telemetry-failures-'));
const failureSwarmDir = path.join(failureRoot, '.swarm');
const failureModulesDir = path.join(failureSwarmDir, 'modules');
fs.mkdirSync(path.join(failureModulesDir, 'mod-fail'), { recursive: true });
fs.mkdirSync(path.join(failureModulesDir, 'mod-block'), { recursive: true });
config.paths = { swarm_dir: failureSwarmDir, modules_dir: failureModulesDir };

const failOnlyStatus = {
  module_id: 'mod-fail',
  title: 'Module Fail',
  status: 'IN_PROGRESS',
  current_phase: 'forge',
  fail_count: 2,
  fail_summaries: [],
  history: [],
  started_at: '2026-04-09T00:00:00.000Z',
  attempt_started_at: '2026-04-09T00:05:00.000Z',
  phase_started_at: '2026-04-09T00:06:00.000Z',
  cost: { total_duration_seconds: 0, attempt_duration_seconds: 0 },
  commit_hash: 'abc123',
};

statusStoreMod.saveStatus(config, 'mod-fail', failOnlyStatus);

const failOnlyResult = await failuresMod.handleFail(
  config,
  failOnlyStatus,
  'mod-fail',
  'mod-fail',
  4,
  'forge',
  'TypeScript compilation errors',
  {
    dispatch_id: 'dispatch-mod-fail-3',
    gateway_label: 'forge-mod-fail-3',
    session_key: 'agent:forge:mod-fail-3',
  },
);
assert.equal(failOnlyResult.exit, 10, 'non-terminal module failures should escalate with EXIT_NEEDS_NOVA when auto-retry is exhausted');
assert.equal(failOnlyResult.attempt, 3);
assert.equal(failOnlyResult.module_status?.attempt, 3);
await flushAsync();

const failOnlyEvents = xaddEvents(sharedStreamKey).slice(18);
assert.equal(failOnlyEvents.length, 1, 'expected one FAIL telemetry event for a non-terminal module failure');
assert.equal(failOnlyEvents[0].type, 'module.status_changed');
assert.equal(failOnlyEvents[0].module_id, 'mod-fail');
assert.equal(failOnlyEvents[0].old_status, 'IN_PROGRESS');
assert.equal(failOnlyEvents[0].new_status, 'FAIL');
assert.equal(failOnlyEvents[0].attempt, 3);
assert.equal(failOnlyEvents[0].dispatch_id, 'dispatch-mod-fail-3');
assert.equal(failOnlyEvents[0].gateway_label, 'dispatch-mod-fail-3');
assert.equal(failOnlyEvents[0].session_key, 'agent:forge:mod-fail-3');
assert.equal(failOnlyEvents[0].phase, 'forge');
assert.equal(failOnlyEvents[0].reason, 'TypeScript compilation errors');

const blockedStatus = {
  module_id: 'mod-block',
  title: 'Module Block',
  status: 'TESTING',
  current_phase: 'buster',
  active_agent: { session_key: 'agent:mod-block:3' },
  fail_count: 2,
  fail_summaries: [],
  history: [],
  started_at: '2026-04-09T00:00:00.000Z',
  attempt_started_at: '2026-04-09T00:10:00.000Z',
  phase_started_at: '2026-04-09T00:11:00.000Z',
  cost: { total_duration_seconds: 0, attempt_duration_seconds: 0 },
  commit_hash: 'def456',
};

statusStoreMod.saveStatus(config, 'mod-block', blockedStatus);

const blockedResult = await failuresMod.handleFail(
  config,
  blockedStatus,
  'mod-block',
  'mod-block',
  3,
  'buster',
  'Unit suites still failing',
  {
    dispatch_id: 'dispatch-mod-block-3',
    gateway_label: 'dispatch-mod-block-3',
    session_key: 'agent:mod-block:3',
  },
);
assert.equal(blockedResult.exit, 20, 'terminal module failures should block once max_fails is reached');
assert.equal(blockedResult.attempt, 3);
await flushAsync();

const blockedEvents = xaddEvents(sharedStreamKey).slice(19);
assert.equal(blockedEvents.length, 3, 'expected FAIL + retry.exhausted + BLOCKED telemetry for a terminal module failure');
assert.equal(blockedEvents[0].type, 'module.status_changed');
assert.equal(blockedEvents[0].module_id, 'mod-block');
assert.equal(blockedEvents[0].old_status, 'TESTING');
assert.equal(blockedEvents[0].new_status, 'FAIL');
assert.equal(blockedEvents[0].attempt, 3);
assert.equal(blockedEvents[0].dispatch_id, 'dispatch-mod-block-3');
assert.equal(blockedEvents[0].gateway_label, 'dispatch-mod-block-3');
assert.equal(blockedEvents[0].session_key, 'agent:mod-block:3');
assert.equal(blockedEvents[0].phase, 'buster');
assert.equal(blockedEvents[0].reason, 'Unit suites still failing');
assert.equal(blockedEvents[1].type, 'retry.exhausted');
assert.equal(blockedEvents[1].module_id, 'mod-block');
assert.equal(blockedEvents[1].attempt, 3);
assert.equal(blockedEvents[1].phase, 'buster');
assert.equal(blockedEvents[1].dispatch_id, 'dispatch-mod-block-3');
assert.equal(blockedEvents[1].gateway_label, 'dispatch-mod-block-3');
assert.equal(blockedEvents[1].session_key, 'agent:mod-block:3');
assert.equal(blockedEvents[1].reason, 'Unit suites still failing');
assert.equal(Object.prototype.hasOwnProperty.call(blockedEvents[1], 'attempts'), false, 'retry.exhausted should use attempt, not attempts');
assert.equal(blockedEvents[2].type, 'module.status_changed');
assert.equal(blockedEvents[2].module_id, 'mod-block');
assert.equal(blockedEvents[2].old_status, 'FAIL');
assert.equal(blockedEvents[2].new_status, 'BLOCKED');
assert.equal(blockedEvents[2].attempt, 3);
assert.equal(blockedEvents[2].dispatch_id, 'dispatch-mod-block-3');
assert.equal(blockedEvents[2].gateway_label, 'dispatch-mod-block-3');
assert.equal(blockedEvents[2].session_key, 'agent:mod-block:3');
assert.equal(blockedEvents[2].phase, 'buster');
assert.equal(blockedEvents[2].reason, 'Max retries (3) exceeded in buster');

const moduleRunnerMod = await importFresh(generalRoot, '/app/skills/pipeline/runners/module-runner.js');
const moduleRunnerRegistry = await buildBuiltInRegistry(generalRoot);
const crashConfig = {
  project: 'proj',
  telemetry: { enabled: true },
  default_timeout_minutes: 15,
  default_max_fails: 3,
  max_buster_crash_retries: 0,
  _runId: sharedRunId,
  run_id: sharedRunId,
  _runStats: runtimeCore.createRunStats('2026-04-09T00:00:00.000Z'),
  _pluginRegistry: moduleRunnerRegistry,
  paths: { swarm_dir: failureSwarmDir, modules_dir: failureModulesDir },
};

let crashStatus = {
  module_id: 'mod-crash',
  title: 'Module Crash',
  status: 'READY_FOR_TESTING',
  current_phase: null,
  active_agent: { session_key: 'agent:crash:session' },
  fail_count: 0,
  fail_summaries: [],
  history: [],
  started_at: '2026-04-09T00:00:00.000Z',
  attempt_started_at: '2026-04-09T00:05:00.000Z',
  phase_started_at: null,
  cost: { total_duration_seconds: 0, attempt_duration_seconds: 0 },
  commit_hash: 'crash123',
};

crashConfig._testOverrides = {
  moduleRunner: {
    checkDependencies: () => ({ met: true }),
    sleep: async () => {},
    loadStatus: () => crashStatus,
    saveStatus: (_config, _dir, nextStatus) => { crashStatus = JSON.parse(JSON.stringify(nextStatus)); },
    savePrompt: () => {},
    saveStreamLog: () => {},
    gitSyncBeforeBuster: async () => {},
    resolvePolicy: () => ({ model: 'buster-test-model', model_source: 'test', thinking: null }),
    logEffectivePolicy: () => {},
    validateBusterConfig: () => {},
    buildBusterModulePrompt: () => ({ prompt: 'run the buster checks' }),
    archiveModuleCompletions: async () => {},
    spawnAgent: async () => ({ dispatch_id: 'buster-dispatch-1' }),
    killAgent: async () => {},
    setShutdownContext: () => {},
    clearShutdownContext: () => {},
    discord: async () => {},
    pollDualWithRateLimitRecovery: async () => ({ ok: false, reason: 'timeout', status: { session_key: 'agent:crash:session' } }),
  },
};

const crashProgress = {
  modules: {
    'mod-crash': {
      title: 'Module Crash',
      dir: 'mods/crash',
      stages: ['buster'],
      timeout_minutes: 15,
      max_buster_crash_retries: 0,
      test_suites: ['unit'],
    },
  },
};

const crashEventOffset = xaddEvents(sharedStreamKey).length;
const crashResult = await moduleRunnerMod.runModule(crashConfig, crashProgress, 'mod-crash');
assert.equal(crashResult.exit, 20, 'terminal Buster crash exhaustion should block the module');
await flushAsync();

const crashEvents = xaddEvents(sharedStreamKey)
  .slice(crashEventOffset)
  .filter((event) => contractEvents.has(event.type));
assert.deepEqual(crashEvents.map((event) => event.type), ['phase.started', 'module.status_changed', 'retry.exhausted', 'module.status_changed']);
assert.equal(crashEvents[0].module_id, 'mod-crash');
assert.equal(crashEvents[0].phase, 'buster');
assert.equal(crashEvents[1].module_id, 'mod-crash');
assert.equal(crashEvents[1].old_status, 'TESTING');
assert.equal(crashEvents[1].new_status, 'FAIL');
assert.equal(crashEvents[1].attempt, 1);
assert.equal(crashEvents[1].phase, 'buster');
assert.equal(crashEvents[1].model, 'buster-test-model');
assert.equal(crashEvents[1].reason, 'Buster timed out (15min)');
assert.equal(crashEvents[2].module_id, 'mod-crash');
assert.equal(crashEvents[2].attempt, 1);
assert.equal(crashEvents[2].phase, 'buster');
assert.equal(crashEvents[2].session_key, 'agent:crash:session');
assert.equal(crashEvents[2].max_attempts, 1);
assert.equal(crashEvents[2].max_fails, 1);
assert.equal(crashEvents[2].reason, 'Buster timed out (15min)');
assert.equal(crashEvents[3].module_id, 'mod-crash');
assert.equal(crashEvents[3].old_status, 'FAIL');
assert.equal(crashEvents[3].new_status, 'BLOCKED');
assert.equal(crashEvents[3].attempt, 1);
assert.equal(crashEvents[3].phase, 'buster');
assert.equal(crashEvents[3].reason, 'Buster crash retries exhausted after 1 attempt (Buster timed out (15min))');

const rateLimitMod = await importFresh(generalRoot, '/app/skills/pipeline/services/rate-limit.js');
const rateLimitRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'check-telemetry-rate-limit-'));
const rateLimitSwarmDir = path.join(rateLimitRoot, '.swarm');
const rateLimitModulesDir = path.join(rateLimitSwarmDir, 'modules');
fs.mkdirSync(path.join(rateLimitModulesDir, 'mod-rate'), { recursive: true });
const rateLimitConfig = {
  ...config,
  rate_limit: { cooldown_hours: 0 },
  paths: { swarm_dir: rateLimitSwarmDir, modules_dir: rateLimitModulesDir },
};
const rateLimitStatus = {
  module_id: 'mod-rate',
  title: 'Module Rate Limited',
  status: 'TESTING',
  current_phase: 'buster',
  fail_count: 1,
  fail_summaries: [],
  history: [],
  started_at: '2026-04-09T00:00:00.000Z',
  attempt_started_at: '2026-04-09T00:05:00.000Z',
  phase_started_at: '2026-04-09T00:06:00.000Z',
  cost: { total_duration_seconds: 0, attempt_duration_seconds: 0 },
  commit_hash: 'rate123',
  active_agent: {
    model: 'buster-test-model',
    session_key: 'agent:buster:mod-rate',
  },
};
statusStoreMod.saveStatus(rateLimitConfig, 'mod-rate', rateLimitStatus);
const rateLimitEventOffset = xaddEvents(sharedStreamKey).length;
await rateLimitMod.handleRateLimit(rateLimitConfig, {
  ...rateLimitStatus,
  reason: '429 Too Many Requests',
  rate_limit_reason: 'provider cooldown requested',
}, 'mod-rate', 1, 3);
await flushAsync();

const rateLimitEvents = xaddEvents(sharedStreamKey).slice(rateLimitEventOffset);
assert.deepEqual(rateLimitEvents.map((event) => event.type), ['rate_limit.detected', 'module.status_changed', 'module.status_changed']);
assert.equal(rateLimitEvents[0].module_id, 'mod-rate');
assert.equal(rateLimitEvents[0].pause_count, 1);
assert.equal(rateLimitEvents[0].max_pauses, 3);
assert.equal(rateLimitEvents[1].module_id, 'mod-rate');
assert.equal(rateLimitEvents[1].old_status, 'TESTING');
assert.equal(rateLimitEvents[1].new_status, 'RATE_LIMITED');
assert.equal(rateLimitEvents[1].attempt, 2);
assert.equal(rateLimitEvents[1].phase, 'buster');
assert.equal(rateLimitEvents[1].model, 'buster-test-model');
assert.equal(rateLimitEvents[1].commit_hash, 'rate123');
assert.equal(rateLimitEvents[1].reason, 'Paused 0h (rate limit)');
assert.equal(rateLimitEvents[2].module_id, 'mod-rate');
assert.equal(rateLimitEvents[2].old_status, 'RATE_LIMITED');
assert.equal(rateLimitEvents[2].new_status, 'TESTING');
assert.equal(rateLimitEvents[2].attempt, 2);
assert.equal(rateLimitEvents[2].phase, 'buster');
assert.equal(rateLimitEvents[2].model, 'buster-test-model');
assert.equal(rateLimitEvents[2].commit_hash, 'rate123');
assert.equal(rateLimitEvents[2].reason, null);
const restoredRateLimitStatus = statusStoreMod.loadStatus(rateLimitConfig, 'mod-rate');
assert.equal(restoredRateLimitStatus.status, 'TESTING');
assert.equal(restoredRateLimitStatus.current_phase, 'buster');

const telemetrySchemaText = fs.readFileSync(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md'), 'utf8');
assert.doesNotThrow(() => assertTelemetrySchemaHotspotAuthority(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md')));
assert.equal(telemetrySchemaText.includes('Canonical event inventory, stream identity, envelope invariants, and compatibility boundaries live in `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md`.'), true);
assert.equal(telemetrySchemaText.includes('This schema is the authoritative event-by-event payload reference for those canonical event names, including authoritative field tables, payload examples, and event-specific correlation notes.'), true);
assert.equal(telemetrySchemaText.includes('The event sections below must remain in exact inventory parity with the contract and must not invent additional canonical event families.'), true);
assert.equal(telemetrySchemaText.includes('For the high-value lifecycle and observability events below, the field table is the authoritative payload surface. Examples and prose illustrate common combinations, but the field table owns the canonical payload field list and meanings.'), true);
assert.equal(telemetrySchemaText.includes('Valid statuses: `PENDING`, `IN_PROGRESS`, `READY_FOR_TESTING`, `TESTING`, `PASS`, `FAIL`, `BLOCKED`, `RATE_LIMITED`'), true);
assert.equal(telemetrySchemaText.includes('"new_status": "RATE_LIMITED"'), true);
assert.equal(telemetrySchemaText.includes('"reason": "Paused 2h (rate limit)"'), true);
assert.equal(telemetrySchemaText.includes('Session-backed agent lifecycle event for ACP/subagent work such as Forge, Echo, and the child session that Buster spawns after a successful task decision. Redis-dispatched Buster work still emits `buster.task_started` / `buster.task_completed` for task-level lifecycle around that child-session work.'), true);
assert.equal(telemetrySchemaText.includes('Session-backed agent termination event for ACP/subagent work such as Forge, Echo, and the child session that Buster spawned for a passing task. Redis-dispatched Buster work still emits `buster.task_completed` for task-level lifecycle, while `agent.killed` closes the child-session lifecycle when one existed.'), true);
assert.equal(telemetrySchemaText.includes('Redis-dispatched Buster work uses `buster.task_started` / `buster.task_completed` instead of `agent.spawned`.'), false);
assert.equal(telemetrySchemaText.includes('Redis-dispatched Buster work uses `buster.task_completed` instead of `agent.killed`.'), false);
assert.equal(telemetrySchemaText.includes('When the spawned or terminated session belongs to gate-owned work and Nova already knows that gate identity, both lifecycle events also preserve canonical `gate_type` and `dispatch_id` join keys alongside `gate_id`, `attempt`, and `session_key`.'), true);
assert.equal(telemetrySchemaText.includes('"gate_type": "review"'), true);
assert.equal(telemetrySchemaText.includes('"dispatch_id": "dispatch-review-06-1"'), true);
assert.equal(telemetrySchemaText.includes('| gate_type | string\\|null | Canonical gate type when the live session is gate-owned and Nova knows that identity |'), true);
assert.equal(telemetrySchemaText.includes('| dispatch_id | string\\|null | Owning dispatch correlation key when the live session belongs to dispatched gate work |'), true);
assert.equal(telemetrySchemaText.includes('| dispatch_id | string\\|null | Owning dispatch correlation key when the paused work already has one |'), true);
assert.equal(telemetrySchemaText.includes('| dispatch_id | string\\|null | Owning dispatch correlation key when the gate verdict belongs to dispatched gate work |'), true);
assert.equal(telemetrySchemaText.includes('When retry exhaustion belongs to dispatched module or gate work, `dispatch_id` preserves the same owning correlation key used on the surrounding verdict, rate-limit, Discord, and replay surfaces when known.'), true);

assert.equal(contractText.includes('When `gate.verdict` or gate-scoped `retry.exhausted` belongs to gate-owned work and Nova already knows that identity, the payload should preserve canonical `gate_type` alongside `gate_id`.'), true);
assert.equal(contractText.includes('When that same gate-owned verdict or exhaustion path is already tied to a dispatch, the payload should also preserve `dispatch_id` so authoritative gate outcomes stay directly joinable with surrounding rate-limit, Discord, and replay surfaces.'), true);

const finalPipelineEvents = xaddEvents(sharedStreamKey);

console.log(JSON.stringify({
  sourceRoot,
  overlayRoot,
  checkedEmitters: ['skills/buster', 'skills/nova/pipeline'],
  emittedEventNames: [...emitted].sort(),
  contractEventNames: [...contractEvents].sort(),
  sharedStreamKey,
  sharedSeqs: finalPipelineEvents.map((event) => event.seq),
}, null, 2));
