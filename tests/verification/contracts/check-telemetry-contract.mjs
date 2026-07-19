#!/usr/bin/env node
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-telemetry-contract' });
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
  extractContractEventNames,
  extractTelemetrySchemaEventNames,
  collectEmitEventNames,
  effectiveFiles,
} from '../lib/lifecycle-audit-lib.mjs';
import {
  installFakeRedis,
  xaddEvents,
  flushAsync,
} from '../lib/fake-redis-lib.mjs';

const args = parseArgs();
const { sourceRoot, overlayRoot } = resolveRoots(args);
const contractPath = resolveTelemetryContractPath(args, sourceRoot);

async function importFresh(runtimeRoot, runtimePath) {
  const href = pathToFileURL(path.join(runtimeRoot, runtimePath.replace(/^\//, ''))).href;
  return import(`${href}?fresh=${Date.now()}-${Math.random()}`);
}

async function buildBuiltInRegistry(runtimeRoot) {
  const registryMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/registry.ts');
  const { registry, errors } = registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, { throwOnError: false });
  assert.equal(errors.length, 0);
  return registry;
}

const contractEvents = extractContractEventNames(contractPath);
const contractText = fs.readFileSync(contractPath, 'utf8');
const novaTelemetrySource = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'services', 'telemetry.ts'), 'utf8');
const telemetryBuildersText = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'services', 'telemetry', 'builders.ts'), 'utf8');
const novaTelemetryStreamSource = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'services', 'telemetry-stream.ts'), 'utf8');
const novaPollingSource = [
  'polling.ts',
  'polling-identity.ts',
  'polling-session-end.ts',
].map((file) => fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'services', file), 'utf8')).join('\n');
const sessionPollIdentityStart = novaPollingSource.indexOf('export function resolveSessionPollIdentity(');
const sessionPollIdentityEnd = novaPollingSource.indexOf('export function resolveStatusPollIdentity(');
const sessionPollIdentitySource = novaPollingSource.slice(sessionPollIdentityStart, sessionPollIdentityEnd);
const sessionPollModuleIdentityMatch = sessionPollIdentitySource.match(/module_id:[\s\S]*?,\n    gate_id:/);
const sessionPollModuleIdentitySource = sessionPollModuleIdentityMatch ? sessionPollModuleIdentityMatch[0] : '';
const novaAcpObservabilitySource = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'services', 'acp-observability.ts'), 'utf8');
const busterTelemetrySource = fs.readFileSync(path.join(sourceRoot, 'skills', 'buster', 'pipeline', 'services', 'telemetry.ts'), 'utf8');
const busterTaskLifecycleSource = fs.readFileSync(path.join(sourceRoot, 'skills', 'buster', 'pipeline', 'services', 'task-lifecycle.ts'), 'utf8');
const busterSuiteRunnerSource = fs.readFileSync(path.join(sourceRoot, 'skills', 'buster', 'pipeline', 'runners', 'suite-runner.ts'), 'utf8');
const sharedTelemetrySource = fs.readFileSync(path.join(sourceRoot, 'skills', 'common', 'pipeline', 'telemetry.ts'), 'utf8');
const agentObservabilityMappingSource = fs.readFileSync(path.join(sourceRoot, 'skills', 'common', 'pipeline', 'agent-observability', 'src', 'mapping.ts'), 'utf8');
const telemetrySchemaPath = path.join(sourceRoot, 'docs', 'telemetry-event-schema.md');
const telemetrySchemaText = fs.readFileSync(telemetrySchemaPath, 'utf8');
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
for (const deletedCompatibilityPhrase of [
  'Migration compatibility',
  'ClawDeck may ingest legacy compatibility shapes',
  'Compatibility-only behavior still accepted',
  'legacy module-scoped Buster stream keys',
  'nested Buster envelopes shaped like',
  'older Buster-only flat-envelope stream variants may still exist',
  'accepts those flat compatibility envelopes',
]) {
  assert.equal(
    contractText.includes(deletedCompatibilityPhrase),
    false,
    `telemetry contract must not keep temporary compatibility-reader language: ${deletedCompatibilityPhrase}`,
  );
}
for (const typedContractPhrase of [
  '### 7.3 Typed producer contract',
  'nested compatibility envelopes are not accepted producer output',
  'module-scoped Buster stream families are not accepted producer output',
  '**Buster transport cutover**',
  '`pipeline:telemetry:<project>:<run_id>` is the only accepted live stream',
]) {
  assert.equal(
    contractText.includes(typedContractPhrase),
    true,
    `telemetry contract must document the hard typed cutover phrase: ${typedContractPhrase}`,
  );
}
assert.equal(
  novaTelemetryStreamSource.includes('_localSeqFallback'),
  false,
  'Nova telemetry stream must not allocate process-local fallback seq values',
);
assert.equal(
  novaTelemetryStreamSource.includes('fallbackKey'),
  false,
  'Nova telemetry stream must not keep local seq fallback key state',
);
assert.equal(
  busterTelemetrySource.includes('resolveTelemetryStreamIdentity'),
  true,
  'Buster telemetry must validate canonical stream identity before Redis stream emission',
);
assert.equal(
  busterTelemetrySource.includes("reason: 'missing_identity'"),
  true,
  'Buster telemetry must classify weak canonical stream identity as missing_identity',
);
assert.equal(
  sharedTelemetrySource.includes('requireTelemetryStreamMaxLen'),
  true,
  'shared telemetry helpers must validate the config-owned canonical Redis live-window max length',
);
const sharedTelemetryMod = await import(`${pathToFileURL(path.join(sourceRoot, 'skills', 'common', 'pipeline', 'telemetry.ts')).href}?fresh=${Date.now()}`);
assert.throws(
  () => sharedTelemetryMod.getTelemetryStreamKey('', 'run-1'),
  /telemetry project is required/,
  'shared telemetry key builder must reject missing project instead of falling back to unknown',
);
assert.throws(
  () => sharedTelemetryMod.getTelemetrySeqKey('project-1', ''),
  /telemetry run_id is required/,
  'shared telemetry sequence key builder must reject missing run identity instead of falling back to unknown',
);
assert.equal(
  sharedTelemetryMod.getTelemetryStreamKey('project-1', 'run-1'),
  'pipeline:telemetry:project-1:run-1',
  'shared telemetry key builder must preserve canonical project/run key format',
);
assert.equal(
  novaTelemetryStreamSource.includes('requireTelemetryStreamMaxLenFromConfig(config)'),
  true,
  'Nova Redis telemetry must read the canonical stream max length from swarm.config.json through the shared policy validator',
);
assert.equal(
  busterTelemetrySource.includes('requireTelemetryStreamMaxLenFromConfig(loadBusterPlatformConfig())'),
  true,
  'Buster Redis telemetry must read the canonical stream max length from swarm.config.json through the shared policy validator',
);
assert.equal(
  busterTelemetrySource.includes('DEFAULT_STREAM_MAXLEN'),
  false,
  'Buster telemetry must not keep a separate legacy stream max length',
);
assert.equal(
  busterTelemetrySource.includes('5000'),
  false,
  'Buster telemetry must not preserve the stale 5000-entry stream retention window',
);
assert.equal(
  busterTelemetrySource.includes('function buildBusterFallbackCorrelation'),
  true,
  'Buster fallback artifacts must use a shared correlation builder for known join fields',
);
assert.equal(
  busterTelemetrySource.includes('gateId: selectDefinedValue(() => (opts.gate_id), () => (null))'),
  true,
  'Buster telemetry context must preserve known gate id for fallback/degraded joinability',
);
assert.equal(
  busterTelemetrySource.includes('dispatch_id: selectDefinedValue(() => (selectDefinedValue(() => (data.dispatch_id), () => (ctx.dispatchId))), () => (null))'),
  true,
  'Buster fallback/degraded telemetry must preserve known dispatch_id',
);
assert.equal(
  busterTelemetrySource.includes('session_key: selectDefinedValue(() => (selectDefinedValue(() => (data.session_key), () => (ctx.sessionKey))), () => (null))'),
  true,
  'Buster fallback/degraded telemetry must preserve known session_key',
);
assert.equal(
  busterTaskLifecycleSource.includes('gate_id: gateId') && busterTaskLifecycleSource.includes('gate_type: gateType'),
  true,
  'Buster task telemetry context must receive validated gate identity when a task is gate-owned',
);
assert.equal(
  busterTaskLifecycleSource.includes('module_id: gateId ? null : moduleId'),
  true,
  'Buster gate task plugin events must not duplicate gate-owned telemetry into module_id',
);
assert.equal(
  busterSuiteRunnerSource.includes('module_id: gateId ? null : moduleId') && busterSuiteRunnerSource.includes('gate_id: gateId'),
  true,
  'Buster suite plugin events must preserve gate identity from the telemetry context',
);
assert.equal(
  novaAcpObservabilitySource.includes('session_key: identity.session_key || identity.sessionKey || sessionLabelOrKey || null'),
  false,
  'ACP observability must not promote session labels into canonical session_key telemetry identity',
);
assert.equal(
  sessionPollModuleIdentitySource.includes('logLabel') || sessionPollModuleIdentitySource.includes('sessionLabel'),
  false,
  'polling session telemetry must not promote log/session labels into canonical module_id',
);
assert.equal(
  sessionPollModuleIdentitySource.includes('selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (tracked?.telemetry_module_id), () => (explicitModuleId))), () => (tracked?.moduleId))), () => (null))'),
  true,
  'polling session telemetry should derive canonical module_id only from tracked or explicit module identity',
);
assert.equal(
  contractText.includes('Redis is a capped live/consumer window, not the durable audit log.'),
  true,
  'telemetry contract must state that Redis is a capped live window rather than durable audit truth',
);
assert.equal(
  contractText.includes('Run-scoped `pipeline.jsonl` is the durable audit trail for replay and post-mortem reconstruction.'),
  true,
  'telemetry contract must state that run-scoped pipeline.jsonl is durable replay truth',
);
assert.equal(
  contractText.includes('Telemetry join keys are owned by typed runtime context, not display text.'),
  true,
  'telemetry contract must lock typed runtime context as joinability authority',
);
assert.equal(
  contractText.includes('monitor lookup keys, log labels, Discord display fields, and generic session labels must not be promoted into `session_key`, `module_id`, `gate_id`, `dispatch_id`, or `gateway_label`'),
  true,
  'telemetry contract must forbid display/routing labels from becoming canonical join keys',
);
assert.equal(
  contractText.includes('gate-owned evidence must not invent a `module_id` fallback'),
  true,
  'telemetry contract must forbid module fallback for gate-owned telemetry evidence',
);
assert.equal(
  telemetrySchemaText.includes('## Common Correlation / Joinability Fields'),
  true,
  'telemetry schema must document common correlation/joinability fields',
);
assert.equal(
  telemetrySchemaText.includes('label | string\\|null | Display-only operator label; never canonical identity'),
  true,
  'telemetry schema must mark label as display-only, not canonical identity',
);
assert.equal(
  telemetrySchemaText.includes('Buster artifact fallback and `observability.degraded` / `observability.restored` mirrors preserve known `attempt`, `dispatch_id`, `session_key`, `gate_id`, and `gate_type`'),
  true,
  'telemetry schema must lock Buster fallback joinability fields',
);
for (const legacyTelemetryMarker of [
  "typeof progress === 'string'",
  'dataOrDuration',
  'phaseOrData',
  'reasonOrData',
  'gateOrType',
  'targetIdOrData',
  'attemptOrData',
  'maxFails',
  'sessionMeta',
  'Legacy: on',
]) {
  assert.equal(
    novaTelemetrySource.includes(legacyTelemetryMarker),
    false,
    `Nova telemetry runtime must not preserve legacy positional signature marker: ${legacyTelemetryMarker}`,
  );
}
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
  contractText.includes('For `summary_type: pipeline`, the canonical live payload also preserves `terminal_status`, `reason_code`, `summary_json_path`, `pipeline_summary_path`, and `latest_json_path`'),
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
const agentObservabilityTelemetryEvents = new Set(
  [...agentObservabilityMappingSource.matchAll(/current_telemetry_type:\s*'([^']+)'/g)]
    .map((match) => match[1])
    .filter((name) => name !== 'plugin.event'),
);
for (const name of agentObservabilityTelemetryEvents) emitted.add(name);
for (const relDir of ['skills/buster', 'skills/nova/pipeline']) {
  const files = effectiveFiles(sourceRoot, overlayRoot, relDir);
  for (const [relPath, absPath] of files.entries()) {
    if (!(relPath.endsWith('.js') || relPath.endsWith('.ts'))) continue;
    for (const name of collectEmitEventNames(absPath)) emitted.add(name);
  }
}
const busterTaskLifecycleText = [
  path.join(sourceRoot, 'skills', 'buster', 'pipeline', 'services', 'task-lifecycle.ts'),
  path.join(sourceRoot, 'skills', 'buster', 'pipeline', 'services', 'task-lifecycle/session.ts'),
].map((filePath) => fs.readFileSync(filePath, 'utf8')).join('\n');
assert.equal(busterTaskLifecycleText.includes("await emitEvent(tctx, 'agent.spawned'"), false, 'Buster task orchestration must not emit agent.spawned outside the observer plugin');
assert.equal(busterTaskLifecycleText.includes("await emitEvent(tctx, 'agent.killed'"), false, 'Buster task orchestration must not emit agent.killed outside the observer plugin');

const unknownEvents = [...emitted].filter((name) => !contractEvents.has(name)).sort();
assert.equal(unknownEvents.length, 0, `Unknown telemetry event names: ${unknownEvents.join(', ')}`);

const retiredAgentStatusEvents = new Set(['agent.killed', 'agent.progress', 'agent.transcript']);
const staleContractEvents = [...contractEvents]
  .filter((name) => !emitted.has(name) && !retiredAgentStatusEvents.has(name))
  .sort();
assert.equal(staleContractEvents.length, 0, `Contract-only telemetry event names: ${staleContractEvents.join(', ')}`);

const payloadSchemaPath = path.join(sourceRoot, 'skills', 'common', 'pipeline', 'services', 'telemetry', 'payload-schema.ts');
const payloadSchema = await import(pathToFileURL(payloadSchemaPath).href);
const novaPayloadSourceEvents = new Set();
for (const relPath of [
  'skills/nova/pipeline/services/telemetry/builders.ts',
  'skills/nova/pipeline/services/observability.ts',
  'skills/nova/pipeline/services/system-io-warning.ts',
  'skills/nova/pipeline/core/policy.ts',
]) {
  for (const eventName of collectEmitEventNames(path.join(sourceRoot, relPath))) novaPayloadSourceEvents.add(eventName);
}
assert.deepEqual(
  payloadSchema.TELEMETRY_PAYLOAD_EVENT_TYPES,
  [...new Set([...novaPayloadSourceEvents, ...agentObservabilityTelemetryEvents, ...retiredAgentStatusEvents, 'plugin.event'])].sort(),
  'common telemetry payload schema registry must exactly cover core builder/progress/observability/system I/O warning events, agent-observability first-class events, retained compatibility event schemas, plus the generic plugin event',
);
assert.deepEqual(
  payloadSchema.TELEMETRY_PAYLOAD_EVENT_TYPES,
  [...contractEvents].sort(),
  'common telemetry payload schema registry must exactly cover canonical telemetry contract events',
);

const validNovaTelemetryPayloads = {
  'agent.killed': { agent_type: 'forge', module_id: '01', reason: 'completed', has_changes: false },
  'agent.ended': { agent_type: 'forge', agent_scope: 'agent', module_id: '01', outcome: 'success', duration_seconds: 3, final_message_count: 1, ended_at: '2026-05-16T20:00:00.000Z' },
  'agent.llm.input.summary': { agent_type: 'forge', module_id: '01', provider: 'anthropic', model: 'claude-sonnet', prompt_chars: 42, history_message_count: 2 },
  'agent.llm.output.summary': { agent_type: 'forge', module_id: '01', provider: 'anthropic', model: 'claude-sonnet', response_chars: 24, usage: { input_tokens: 10, output_tokens: 20 }, input_tokens: 10, output_tokens: 20 },
  'agent.model.started': { agent_type: 'forge', module_id: '01', provider: 'anthropic', model: 'claude-sonnet', model_call_id: 'model-call-1', request: { temperature: 0.1 } },
  'agent.model.ended': { agent_type: 'forge', module_id: '01', provider: 'anthropic', model: 'claude-sonnet', model_call_id: 'model-call-1', outcome: 'success', duration_seconds: 1, usage: { input_tokens: 10 }, input_tokens: 10 },
  'agent.progress': { agent_type: 'forge', module_id: '01', status: 'active', elapsed_seconds: 3 },
  'agent.session.started': { agent_type: 'forge', module_id: '01', session_key: 'agent:forge:session-1', started_at: '2026-05-16T20:00:00.000Z' },
  'agent.session.ended': { agent_type: 'forge', module_id: '01', session_key: 'agent:forge:session-1', outcome: 'success', duration_seconds: 3, ended_at: '2026-05-16T20:03:00.000Z' },
  'agent.spawn.requested': { agent_type: 'forge', module_id: '01', requester_session_key: 'agent:nova:session-parent', spawn_mode: 'session', thread: true, requester_origin: { channel: 'discord' }, requested_at: '2026-05-16T20:00:00.000Z' },
  'agent.spawned': { agent_type: 'forge', label: 'forge-01', module_id: '01', dispatch: 'acp' },
  'agent.delivery.target': { agent_type: 'forge', module_id: '01', requester_session_key: 'agent:nova:session-parent', child_session_key: 'agent:forge:session-1', spawn_mode: 'session', expects_completion_message: true, requester_origin: { channel: 'discord' }, targeted_at: '2026-05-16T20:00:01.000Z' },
  'agent.tool.started': { agent_type: 'forge', module_id: '01', tool_name: 'read', tool_call_id: 'tool-1', params_bytes: 12, param_keys: ['path'] },
  'agent.tool.finished': { agent_type: 'forge', module_id: '01', tool_name: 'read', tool_call_id: 'tool-1', outcome: 'success', duration_seconds: 0.2, result_bytes: 128 },
  'agent.transcript': { agent_type: 'forge', module_id: '01', line_kind: 'stdout', text: 'hello' },
  'approval.requested': { approval_id: 'release', prompt: 'Approve?', options: ['APPROVE', 'REJECT'], gate_id: 'release', timeout_policy: 'BLOCK' },
  'approval.resolved': { approval_id: 'release', choice: 'APPROVE', gate_id: 'release', status: 'APPROVE' },
  'budget.exceeded': { threshold: 100, current: 125, limit: 100, unit: 'usd', percent_used: 125 },
  'budget.warning': { threshold: 80, current: 85, limit: 100, unit: 'usd', percent_used: 85 },
  'cost.update': { module_id: '01', cost_usd: 0.12, total_cost_usd: 0.34, input_tokens: 10, output_tokens: 20 },
  'error.escalation': { module_id: '01', fail_count: 2, last_failure: 'tests failed', action: 'needs_nova' },
  'gate.started': { gate_id: 'review', gate_type: 'review', title: 'Review', reviewers: ['raven'] },
  'gate.verdict': { gate_id: 'review', gate_type: 'review', verdict: 'PASS', issues_count: 0 },
  'module.started': { module_id: '01', model: 'claude-sonnet', attempt: 1 },
  'module.status_changed': { module_id: '01', old_status: 'IN_PROGRESS', new_status: 'PASS', attempt: 1 },
  'observability.degraded': { component: 'fast', surface: 'redis', reason: 'redis_emit_failed', detail: 'down' },
  'observability.restored': { component: 'fast', surface: 'redis', reason: 'redis_emit_failed', restored_after_ms: 10 },
  'phase.completed': { module_id: '01', phase: 'forge' },
  'phase.started': { module_id: '01', phase: 'forge', model: 'claude-sonnet' },
  'pipeline.completed': { terminal_status: 'succeeded', reason_code: null, duration_seconds: 5, modules_passed: 1, modules_failed: 0, modules_total: 1, total_cost_usd: 0.1 },
  'pipeline.halted': { reason: 'BLOCKED', module_id: '01', terminal_status: 'blocked' },
  'pipeline.started': { modules: [{ id: '01' }], gates: [], execution_order: ['01'], models: {}, resume: false, nova_prompt: null },
  'plugin.event': { plugin_id: 'buster', plugin_event: 'suite_completed', module_id: '01', attempt: 1, status: 'PASS', details: { suite: 'unit', checks_passed: 4 } },
  'rate_limit.detected': { agent_type: 'forge', module_id: '01', provider: 'anthropic', retry_after_seconds: 60 },
  'retry.exhausted': { module_id: '01', attempt: 3, max_attempts: 3, reason: 'failed' },
  'retry.scheduled': { module_id: '01', attempt: 2, max_attempts: 3, delay_seconds: 5 },
  'system.io_warning': { component: 'model_policy', surface: 'audit_log', reason: 'policy_audit_append_failed', operation: 'append', path: '/tmp/.swarm/logs/pipeline/model-policy.jsonl', path_role: 'model_policy_jsonl', code: 'ENOSPC' },
  'summary.completed': { summary_type: 'pipeline', status: 'PASS', reason: null, terminal_status: 'succeeded', reason_code: 'PIPELINE_COMPLETE', output_dir: '/tmp/pipeline', markdown_path: '/tmp/project-summary.md', data_path: '/tmp/project-summary.json', case_study_base_path: '/tmp/case-study.base.json', summary_json_path: '/tmp/summary.json' },
  'summary.started': { summary_type: 'pipeline', status: 'started', terminal_status: 'succeeded', reason_code: 'PIPELINE_COMPLETE', output_dir: '/tmp/pipeline' },
};
assert.deepEqual(
  Object.keys(validNovaTelemetryPayloads).sort(),
  payloadSchema.TELEMETRY_PAYLOAD_EVENT_TYPES,
  'telemetry payload contract test fixtures must cover every Nova schema event',
);
for (const [eventType, samplePayload] of Object.entries(validNovaTelemetryPayloads)) {
  assert.deepEqual(
    payloadSchema.validateTelemetryEventPayload(eventType, samplePayload),
    [],
    `valid sample payload should pass telemetry schema validation for ${eventType}`,
  );
}
assert.deepEqual(
  payloadSchema.validateTelemetryEventPayload('telemetry.unknown', {}),
  ["eventType 'telemetry.unknown' is not registered in TELEMETRY_PAYLOAD_SCHEMAS"],
  'unknown telemetry event types should be rejected by the payload schema registry',
);
const deniedPluginSpecificEventTypes = [
  'plugin.worker.module_buster.bridge_invoked',
  'plugin.worker.module_forge.bridge_invoked',
  'plugin.gate.review.bridge_invoked',
  'plugin.validator.full_lint.bridge_invoked',
  'plugin.generator.pipeline_review.bridge_invoked',
];
for (const eventType of deniedPluginSpecificEventTypes) {
  assert.deepEqual(
    payloadSchema.validateTelemetryEventPayload(eventType, { plugin_id: 'builtin', plugin_event: 'bridge_invoked', details: {} }),
    [`eventType '${eventType}' is not registered in TELEMETRY_PAYLOAD_SCHEMAS`],
    `${eventType} must not bypass canonical plugin.event telemetry`,
  );
}
assert.deepEqual(
  payloadSchema.validateTelemetryEventPayload('pipeline.completed', { reason_code: 'missing terminal status' }),
  ['terminal_status is required'],
  'required telemetry payload fields should be enforced',
);
for (const [eventType, requiredPayload] of Object.entries({
  'pipeline.completed': { terminal_status: 'succeeded' },
  'pipeline.halted': { reason: 'blocked' },
  'summary.started': { summary_type: 'pipeline' },
  'summary.completed': { summary_type: 'pipeline' },
  'error.escalation': {},
})) {
  for (const deniedField of ['exit', 'exit_code', 'exit_reason', 'exitCode', 'exitLabel']) {
    assert.deepEqual(
      payloadSchema.validateTelemetryEventPayload(eventType, { ...requiredPayload, [deniedField]: 10 }),
      [`${deniedField} is not allowed for ${eventType}`],
      `${eventType} must not accept numeric terminal field ${deniedField}`,
    );
  }
}
assert.deepEqual(
  payloadSchema.validateTelemetryEventPayload('gate.verdict', { gate_id: 'review', verdict: 'MAYBE' }),
  ['verdict has invalid type or value'],
  'event-specific telemetry payload validators should reject invalid enum values',
);
assert.deepEqual(
  payloadSchema.validateTelemetryEventPayload('module.started', { module_id: '01', unexpected: true }),
  ['unexpected is not allowed for module.started'],
  'telemetry payload schemas should reject fields outside the registered event shape',
);
assert.deepEqual(
  payloadSchema.validateTelemetryEventPayload('plugin.event', { plugin_id: 'buster', plugin_event: 'visual_reg', details: {}, pages_total: 1 }),
  ['pages_total is not allowed for plugin.event'],
  'plugin.event must keep plugin-owned fields inside details instead of arbitrary top-level fields',
);
assert.deepEqual(
  payloadSchema.buildPluginTelemetryPayload('buster', 'visual_reg', { module_id: '01', pages_total: 1, details: { overall: 'PASS' } }),
  { plugin_id: 'buster', plugin_event: 'visual_reg', details: { pages_total: 1, overall: 'PASS' }, module_id: '01' },
  'plugin event builder should preserve core correlation top-level and move plugin-owned fields into details',
);
assert.throws(
  () => payloadSchema.assertTelemetryEventPayload('agent.transcript', null),
  (error) => error?.name === 'TelemetryPayloadInvalidError'
    && error?.code === 'TELEMETRY_PAYLOAD_INVALID'
    && error?.eventType === 'agent.transcript'
    && error?.validationErrors?.includes('payload must be an object'),
  'payload assertion should throw a structured telemetry payload invalid error',
);

const dispatchForSchema = await import(pathToFileURL(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'services', 'telemetry', 'dispatch.ts')).href);
const builtinsRegistrySource = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'core', 'registry', 'builtins.ts'), 'utf8');
assert.equal(builtinsRegistrySource.includes("ctx.telemetry.emit({ eventType: 'plugin.event'"), true, 'built-in plugin bridge traces must emit canonical plugin.event telemetry');
assert.equal(builtinsRegistrySource.includes("ctx.telemetry.emit({ eventType, payload })"), false, 'built-in plugin bridge traces must not emit unregistered plugin-specific event types');
assert.equal(builtinsRegistrySource.includes("ctx.stream.emit({ eventType: 'plugin.event'"), false, 'built-in plugin bridge traces must not route canonical telemetry through the generic plugin stream surface');
const invalidTelemetrySwarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-payload-invalid-'));
const invalidTelemetryDir = path.join(invalidTelemetrySwarmDir, 'logs', 'pipeline', 'runs', 'run-invalid-payload');
const invalidTelemetryResult = await dispatchForSchema.emitEvent({
  config: {
    project: 'telemetry-payload-invalid',
    paths: { swarm_dir: invalidTelemetrySwarmDir },
    _runId: 'run-invalid-payload',
  },
}, 'gate.verdict', { gate_id: 'review', verdict: 'MAYBE' });
assert.equal(invalidTelemetryResult.event, null, 'invalid telemetry payloads must not be emitted to the core disk event stream');
assert.equal(invalidTelemetryResult.input, null, 'invalid telemetry payloads must not be dispatched to telemetry sinks');
assert.match(invalidTelemetryResult.validationError, /Invalid telemetry payload for 'gate.verdict'/);
const invalidTelemetryEvents = fs.readFileSync(path.join(invalidTelemetryDir, 'pipeline.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line));
assert.deepEqual(
  invalidTelemetryEvents.map((event) => event.type),
  ['observability.degraded'],
  'invalid telemetry payloads should only record a degraded observability event',
);
assert.equal(invalidTelemetryEvents[0].reason, 'telemetry_payload_invalid');
assert.equal(invalidTelemetryEvents[0].impacted_event_type, 'gate.verdict');

const invalidPluginEventSwarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-plugin-event-invalid-'));
const invalidPluginEventDir = path.join(invalidPluginEventSwarmDir, 'logs', 'pipeline', 'runs', 'run-invalid-plugin-event');
const invalidPluginEventResult = await dispatchForSchema.emitEvent({
  config: {
    project: 'telemetry-plugin-event-invalid',
    paths: { swarm_dir: invalidPluginEventSwarmDir },
    _runId: 'run-invalid-plugin-event',
  },
}, 'plugin.worker.module_buster.bridge_invoked', {
  plugin_id: 'builtin.worker.module_buster',
  plugin_event: 'bridge_invoked',
  details: { stageId: 'worker:module_buster' },
});
assert.equal(invalidPluginEventResult.event, null, 'unregistered plugin-specific events must not be emitted to the core disk event stream');
assert.equal(invalidPluginEventResult.input, null, 'unregistered plugin-specific events must not be dispatched to telemetry sinks');
assert.match(invalidPluginEventResult.validationError, /Invalid telemetry payload for 'plugin\.worker\.module_buster\.bridge_invoked'/);
const invalidPluginEvents = fs.readFileSync(path.join(invalidPluginEventDir, 'pipeline.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line));
assert.deepEqual(
  invalidPluginEvents.map((event) => event.type),
  ['observability.degraded'],
  'unregistered plugin-specific events should only record a degraded observability event',
);
assert.equal(invalidPluginEvents[0].impacted_event_type, 'plugin.worker.module_buster.bridge_invoked');

const sharedRunId = 'run-1';
const sharedStreamKey = 'pipeline:telemetry:proj:run-1';

const previousRedisPassword = process.env.REDIS_PASSWORD;
const previousRedisHost = process.env.REDIS_HOST;
const previousRedisPort = process.env.REDIS_PORT;
process.env.REDIS_HOST = '127.0.0.1';
process.env.REDIS_PORT = '6379';
process.env.REDIS_PASSWORD = 'verification-redis-password';

const { runtimeRoot: busterPipelineRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'busterPipeline');
installFakeRedis(busterPipelineRoot);
const busterTelemetry = await importRuntimeModule(busterPipelineRoot, '/app/skills/pipeline/services/telemetry.ts');
const busterCtxA = busterTelemetry.createTelemetryContext({
  project: 'proj',
  module_id: 'mod-a',
  run_id: sharedRunId,
  enabled: true,
  host: '127.0.0.1',
  port: 6379,
  enforceSecureMode: false,
  streamMaxLen: 10000,
});
assert.equal(busterCtxA.streamKey, sharedStreamKey);

await busterTelemetry.emitPluginEvent(busterCtxA, 'task_started', { module_id: 'mod-a', attempt: 1 });
await busterTelemetry.emitPluginEvent(busterCtxA, 'task_completed', { module_id: 'mod-a', outcome: 'PASS' });
const busterCtxB = busterTelemetry.createTelemetryContext({
  project: 'proj',
  module_id: 'mod-a',
  run_id: sharedRunId,
  enabled: true,
  host: '127.0.0.1',
  port: 6379,
  enforceSecureMode: false,
  streamMaxLen: 10000,
});
assert.equal(busterCtxB.streamKey, sharedStreamKey);
await busterTelemetry.emitPluginEvent(busterCtxB, 'session_monitor', { module_id: 'mod-a', elapsed_seconds: 3 });
await busterTelemetry.closeTelemetry(busterCtxA);
await busterTelemetry.closeTelemetry(busterCtxB);

const { runtimeRoot: generalRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
installFakeRedis(generalRoot);
const runtimeCore = await importRuntimeModule(generalRoot, '/app/skills/pipeline/core/runtime.ts');
const builtInRegistry = await buildBuiltInRegistry(generalRoot);
  const config = {
    project: 'proj',
    repo_root: path.join(generalRoot, 'app'),
    paths: {
      swarm_dir: path.join(generalRoot, 'workspace', '.swarm'),
      modules_dir: path.join(generalRoot, 'workspace', '.swarm', 'modules'),
    },
    pipeline_defaults: {
      timeout_minutes: 30,
      max_fails: 3,
      auto_retry_threshold: 2,
      agent_startup_retry_budget: 2,
      session_nudge_threshold: 0.75,
    },
    rate_limit: {
      cooldown_hours: 0,
      max_pauses_per_module: 3,
      cooldown_buffer_ms: 0,
    },
    review_defaults: {
      timeout_minutes: 30,
      max_fix_cycles: 3,
      lint_tier: 'full',
      lint_required: false,
    },
    case_study: { timeout_minutes: 30 },
    arch_validation: {
      enabled: true,
      agent_enabled: false,
      timeout_minutes: 15,
    },
  telemetry: {
    enabled: true,
    stream_max_len: 10000,
    sink_timeout_ms: 5000,
    host: '127.0.0.1',
    port: 6379,
    enforceSecureMode: false,
  },
  locks: {
    lifecycle_append: { stale_ms: 300000, timeout_ms: 30000 },
    gate_active_session: { stale_ms: 300000, timeout_ms: 30000 },
  },
  gates: { 'gate:quality': { type: 'review', title: 'Quality' } },
  compatibility: { legacy_module_status_bootstrap_mode: 'migration_only' },
  resume: false,
  nova_prompt: 'do the thing',
  pluginRegistry: builtInRegistry,
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

const telemetrySinkContractMod = await importFresh(generalRoot, '/app/skills/pipeline/services/telemetry-sink-contract.ts');
const telemetrySinkDispatchMod = await importFresh(generalRoot, '/app/skills/pipeline/services/telemetry-sink-dispatch.ts');
const aliasSinkInput = telemetrySinkContractMod.buildTelemetrySinkInput(ctx, 'module.status_changed', { module_id: 'mod-a' }, {
  moduleId: 'mod-a',
  snapshot: { status: 'PASS', compatibility_alias: true },
});
assert.deepEqual(aliasSinkInput.stateSnapshot, { status: 'PASS', compatibility_alias: true }, 'telemetry sink input should accept snapshot as a compatibility alias for stateSnapshot');
assert.throws(
  () => telemetrySinkContractMod.assertTelemetrySinkInput(telemetrySinkContractMod.buildTelemetrySinkInput(ctx, 'module.status_changed', { module_id: 'mod-a' }, {
    moduleId: 'mod-a',
    presentation: { discord: { embeds: [{ title: 'legacy embed shape' }] } },
  })),
  /presentation\.discord\.embeds is not supported/,
  'Discord telemetry presentation must reject legacy embed alternatives at the typed sink boundary',
);
assert.throws(
  () => telemetrySinkContractMod.assertTelemetrySinkInput(telemetrySinkContractMod.buildTelemetrySinkInput(ctx, 'module.status_changed', { module_id: 'mod-a' }, {
    moduleId: 'mod-a',
    presentation: { discord: { fields: [{ name: 'Module', value: 1 }] } },
  })),
  /fields\[0\] must include string name and value/,
  'Discord telemetry fields must use canonical string name/value entries',
);

let observedSinkInput = null;
let observedSinkStateSnapshot = null;
const sinkSnapshotPlugin = {
  enabled: true,
  manifest: {
    moduleId: 'contract.telemetry.state_snapshot_sink',
    sourceType: 'builtin',
    hookFamily: 'telemetry.sink',
    stageId: 'telemetry.sink',
    capabilities: [],
    priority: 0,
  },
  config: {},
  implementation: {
    observe: async (input, pluginContext) => {
      observedSinkInput = input;
      observedSinkStateSnapshot = await pluginContext.read.stateSnapshot();
    },
  },
};
const sinkSnapshotConfig = {
  project: 'proj',
  telemetry: { sink_timeout_ms: 5000 },
  _runId: sharedRunId,
  run_id: sharedRunId,
  pluginRegistry: {
    enabled: true,
    hookIndex: {
      'telemetry.sink': {
        'telemetry.sink': [sinkSnapshotPlugin],
      },
    },
  },
};
await telemetrySinkDispatchMod.dispatchTelemetrySinks({ config: sinkSnapshotConfig, progress }, 'module.status_changed', {
  module_id: 'mod-a',
  new_status: 'PASS',
}, {
  moduleId: 'mod-a',
  stateSnapshot: { status: 'PASS', terminal: true },
});
assert.deepEqual(observedSinkInput.stateSnapshot, { status: 'PASS', terminal: true }, 'telemetry sink input should carry stateSnapshot');
assert.deepEqual(observedSinkStateSnapshot, { status: 'PASS', terminal: true }, 'telemetry sink plugin context read.stateSnapshot() should expose the emitted stateSnapshot');

const novaTelemetryA = await importFresh(generalRoot, '/app/skills/pipeline/services/telemetry.ts');
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
novaTelemetryA.onPipelineHalted(ctx, {
  step_type: 'module',
  step_id: 'mod-b',
  terminal_status: 'blocked',
  reason: 'BLOCKED',
});
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
  gateway_label: 'buster-gate-contract-1',
  session_key: 'agent:buster:gate-contract-1',
  duration_seconds: 12,
});
novaTelemetryA.onGateFail(ctx, 'gate:dispatch-fail', {
  gate_type: 'buster',
  dispatch_id: 'dispatch-gate-contract-2',
  gateway_label: 'buster-gate-contract-2',
  session_key: 'agent:buster:gate-contract-2',
  reason: 'dispatch failed',
  duration_seconds: 9,
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
assert.equal(Object.prototype.hasOwnProperty.call(novaTelemetryA, 'onAgentSpawned'), false);
assert.equal(Object.prototype.hasOwnProperty.call(novaTelemetryA, 'onAgentKilled'), false);
assert.equal(Object.prototype.hasOwnProperty.call(novaTelemetryA, 'emitTranscriptLine'), false);
assert.equal(Object.prototype.hasOwnProperty.call(novaTelemetryA, 'emitAgentProgress'), false);
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

const novaTelemetryB = await importFresh(generalRoot, '/app/skills/pipeline/services/telemetry.ts');
novaTelemetryB.onPipelineCompleted(ctx, 'succeeded', 'OK', {
  modules_passed: 1,
  modules_failed: 1,
  modules_blocked: 1,
  modules_total: 3,
  total_cost_usd: 0.32,
});
await flushAsync();
await novaTelemetryB.closeTelemetryRedis();

const pipelineEvents = xaddEvents(sharedStreamKey);
const baselinePipelineEventCount = 17;
assert.equal(pipelineEvents.length, baselinePipelineEventCount, 'expected seventeen telemetry xadd operations on the shared run stream after plugin-owned agent transcript/progress no-ops');
assert.deepEqual(
  pipelineEvents.map((event) => event.seq),
  Array.from({ length: baselinePipelineEventCount }, (_, index) => index + 1),
);
assert(pipelineEvents.every((event) => event.v === 1), 'all telemetry events must set v=1');
assert(pipelineEvents.every((event) => event.project === 'proj' && event.run_id === sharedRunId));

const busterEvents = pipelineEvents.filter((event) => event.source === 'buster');
assert.equal(busterEvents.length, 3, 'expected three Buster telemetry events on the shared run stream');
assert.deepEqual(busterEvents.map((event) => event.seq), [1, 2, 3]);
assert(busterEvents.every((event) => event.emitter === 'buster/pipeline/services/telemetry'));
assert(busterEvents.every((event) => event.module_id === 'mod-a'));
assert(busterEvents.every((event) => !Object.prototype.hasOwnProperty.call(event, 'data')), 'Buster telemetry payload must be flat, not nested under data');
assert.deepEqual(busterEvents.map((event) => event.type), ['plugin.event', 'plugin.event', 'plugin.event']);
assert.deepEqual(busterEvents.map((event) => event.plugin_id), ['buster', 'buster', 'buster']);
assert.deepEqual(busterEvents.map((event) => event.plugin_event), ['task_started', 'task_completed', 'session_monitor']);
assert.equal(busterEvents[2].details.elapsed_seconds, 3);

const invalidBusterDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-telemetry-invalid-'));
const invalidBusterRunLog = path.join(invalidBusterDir, 'pipeline.jsonl');
const invalidBusterCtx = busterTelemetry.createTelemetryContext({
  project: 'proj',
  module_id: 'mod-a',
  run_id: 'run-invalid-buster-payload',
  enabled: true,
  pipeline_run_log_path: invalidBusterRunLog,
  host: '127.0.0.1',
  port: 6379,
  enforceSecureMode: false,
  streamMaxLen: 10000,
});
const invalidBusterResult = await busterTelemetry.emitEvent(invalidBusterCtx, 'plugin.event', {
  plugin_id: 'buster',
  plugin_event: 'visual_reg',
  details: {},
  pages_total: 1,
});
assert.equal(invalidBusterResult.event, null, 'invalid Buster telemetry payloads must not be emitted');
assert.match(invalidBusterResult.validationError, /Invalid telemetry payload for 'plugin.event'/);
assert.equal(xaddEvents('pipeline:telemetry:proj:run-invalid-buster-payload').length, 0, 'invalid Buster telemetry payload must not reach Redis');
const invalidBusterEvents = fs.readFileSync(invalidBusterRunLog, 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line));
assert.deepEqual(invalidBusterEvents.map((event) => event.type), ['observability.degraded']);
assert.equal(invalidBusterEvents[0].reason, 'telemetry_payload_invalid');
assert.equal(invalidBusterEvents[0].impacted_event_type, 'plugin.event');
assert.deepEqual(invalidBusterEvents[0].validation_errors, ['pages_total is not allowed for plugin.event']);
await busterTelemetry.closeTelemetry(invalidBusterCtx);

const novaEvents = pipelineEvents.filter((event) => event.source === 'pipeline');
assert.equal(novaEvents.length, baselinePipelineEventCount - 3, 'expected fourteen Nova telemetry events on the shared run stream after plugin-owned agent transcript/progress no-ops');
assert.deepEqual(
  novaEvents.map((event) => event.seq),
  Array.from({ length: baselinePipelineEventCount - 3 }, (_, index) => index + 4),
);
assert(novaEvents
  .filter((event) => event.type !== 'observability.degraded' && event.type !== 'observability.restored')
  .every((event) => event.emitter === 'nova/pipeline/services/telemetry'));
assert(novaEvents
  .filter((event) => event.type === 'observability.degraded' || event.type === 'observability.restored')
  .every((event) => event.emitter === 'nova/pipeline/services/observability'));

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
assert.equal(halted.terminal_status, 'blocked');
assert(!Object.prototype.hasOwnProperty.call(halted, 'halted_at_module'));
assert(!Object.prototype.hasOwnProperty.call(halted, 'halted_at_gate'));
assert.equal(
  telemetryBuildersText.includes("String(stepId || '').startsWith('gate:')") || telemetryBuildersText.includes('config?.gates?.[stepId]'),
  false,
  'pipeline.halted telemetry must not infer module/gate ownership from step-id strings or configured gates'
);

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
assert.equal(gateVerdictWithDispatch.run_id, sharedRunId);
assert.equal(gateVerdictWithDispatch.dispatch_id, 'dispatch-gate-contract-1');
assert.equal(gateVerdictWithDispatch.gateway_label, 'buster-gate-contract-1');
assert.equal(gateVerdictWithDispatch.session_key, 'agent:buster:gate-contract-1');
assert.equal(gateVerdictWithDispatch.verdict, 'PASS');
const gateFailVerdictWithDispatch = pipelineEvents.find((event) => event.type === 'gate.verdict' && event.gate_id === 'gate:dispatch-fail');
assert(gateFailVerdictWithDispatch, 'missing gate.verdict FAIL dispatch correlation event');
assert.equal(gateFailVerdictWithDispatch.run_id, sharedRunId);
assert.equal(gateFailVerdictWithDispatch.dispatch_id, 'dispatch-gate-contract-2');
assert.equal(gateFailVerdictWithDispatch.gateway_label, 'buster-gate-contract-2');
assert.equal(gateFailVerdictWithDispatch.session_key, 'agent:buster:gate-contract-2');
assert.equal(gateFailVerdictWithDispatch.verdict, 'FAIL');

const gateRetryExhaustedWithDispatch = pipelineEvents.find((event) => event.type === 'retry.exhausted' && event.gate_id === 'gate:dispatch');
assert(gateRetryExhaustedWithDispatch, 'missing retry.exhausted dispatch correlation event');
assert.equal(gateRetryExhaustedWithDispatch.gate_type, 'buster');
assert.equal(gateRetryExhaustedWithDispatch.dispatch_id, 'dispatch-gate-contract-1');
assert.equal(gateRetryExhaustedWithDispatch.session_key, 'agent:buster:gate-contract-1');
assert.equal(gateRetryExhaustedWithDispatch.phase, 'buster_gate');

assert.equal(pipelineEvents.some((event) => event.type === 'agent.transcript'), false);
assert.equal(pipelineEvents.some((event) => event.type === 'agent.progress'), false);

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

const failuresMod = await importFresh(generalRoot, '/app/skills/pipeline/services/failures/retry-policy.ts');
const statusStoreMod = await importFresh(generalRoot, '/app/skills/pipeline/services/status-store.ts');
const failureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'check-telemetry-failures-'));
const failureSwarmDir = path.join(failureRoot, '.swarm');
const failureModulesDir = path.join(failureSwarmDir, 'modules');
const failureRunLogDir = path.join(failureSwarmDir, 'runs', sharedRunId);
fs.mkdirSync(path.join(failureModulesDir, 'mod-fail'), { recursive: true });
fs.mkdirSync(path.join(failureModulesDir, 'mod-block'), { recursive: true });
fs.mkdirSync(failureRunLogDir, { recursive: true });
config.paths = { swarm_dir: failureSwarmDir, modules_dir: failureModulesDir };
config._runId = sharedRunId;
config.run_id = sharedRunId;

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

statusStoreMod.appendModuleLifecycleEvent(config, 'mod-fail', failOnlyStatus, {
  eventType: 'module_attempt.started',
  oldStatus: 'PENDING',
  previousPhase: null,
  note: 'seed contract fixture open attempt',
  now: failOnlyStatus.attempt_started_at,
});

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
assert.equal(failOnlyResult.kind, 'pipeline_step_result', 'non-terminal module failures should return canonical typed step results');
assert.equal(failOnlyResult.outcome, 'needs_nova', 'non-terminal module failures should escalate with typed needs_nova when auto-retry is exhausted');
assert.equal(failOnlyResult.terminal.decision.reasonCode, 'needs_nova', 'needs-Nova escalations must not expose the underlying test failure as the terminal reason');
assert.equal(failOnlyResult.correlation.attempt, 3);
assert.equal(failOnlyResult.diagnostics.metadata.module_status?.attempt, 3);
await flushAsync();

const failOnlyEvents = xaddEvents(sharedStreamKey).slice(baselinePipelineEventCount);
assert.equal(failOnlyEvents.length, 1, 'expected one FAIL telemetry event for a non-terminal module failure');
assert.equal(failOnlyEvents[0].type, 'module.status_changed');
assert.equal(failOnlyEvents[0].module_id, 'mod-fail');
assert.equal(failOnlyEvents[0].old_status, 'IN_PROGRESS');
assert.equal(failOnlyEvents[0].new_status, 'FAIL');
assert.equal(failOnlyEvents[0].attempt, 3);
assert.equal(failOnlyEvents[0].dispatch_id, 'dispatch-mod-fail-3');
assert.equal(failOnlyEvents[0].gateway_label, 'forge-mod-fail-3');
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

statusStoreMod.appendModuleLifecycleEvent(config, 'mod-block', blockedStatus, {
  eventType: 'module_attempt.started',
  oldStatus: 'PENDING',
  previousPhase: null,
  note: 'seed contract fixture open attempt',
  now: blockedStatus.attempt_started_at,
});

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
assert.equal(blockedResult.terminal.status, 'blocked', 'terminal module failures should block once max_fails is reached');
assert.equal(blockedResult.correlation.attempt, 3);
await flushAsync();

const blockedEvents = xaddEvents(sharedStreamKey).slice(baselinePipelineEventCount + 1);
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

const moduleRunnerMod = await importFresh(generalRoot, '/app/skills/pipeline/runners/module-runner.ts');
const moduleRunnerRegistry = await buildBuiltInRegistry(generalRoot);
const crashConfig = {
  project: 'proj',
  repo_root: path.join(generalRoot, 'app'),
  telemetry: {
    enabled: true,
    stream_max_len: 10000,
    sink_timeout_ms: 5000,
    host: '127.0.0.1',
    port: 6379,
    enforceSecureMode: false,
  },
  pipeline_defaults: {
    timeout_minutes: 15,
    max_fails: 3,
    auto_retry_threshold: 0,
    agent_startup_retry_budget: 0,
    session_nudge_threshold: 0,
  },
  locks: {
    lifecycle_append: { stale_ms: 300000, timeout_ms: 30000 },
  },
  agents: {
    buster: { dispatch: 'redis' },
  },
  buster: {
    runtime: {
      heartbeat_path: '/tmp/kubeclaw-buster-heartbeat',
      heartbeat_interval_ms: 1000,
      task_poll_interval_ms: 2000,
      task_pending_reclaim_idle_ms: 60000,
      completion_event_block_ms: 0,
      completion_recovery_scan_interval_ms: 5000,
      task_stream_max_len: 250,
      suite_timeout_ms: 300000,
      max_crash_retries: 0,
    },
  },
  _runId: sharedRunId,
  run_id: sharedRunId,
  _runStats: runtimeCore.createRunStats('2026-04-09T00:00:00.000Z'),
  pluginRegistry: moduleRunnerRegistry,
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

const crashDeps = {
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
    spawnAgent: async () => ({
      dispatch_id: 'buster-dispatch-1',
      gateway_label: 'buster-dispatch-1',
      session_key: 'agent:crash:session',
    }),
    killAgent: async () => {},
    setShutdownContext: () => {},
    clearShutdownContext: () => {},
    discord: async () => {},
    pollDualWithRateLimitRecovery: async () => ({ ok: false, reason: 'timeout', failure_class: 'timeout', status: { session_key: 'agent:crash:session' } }),
  },
};

const crashProgress = {
  modules: {
    'mod-crash': {
      title: 'Module Crash',
      dir: 'mods/crash',
      stages: ['buster'],
      timeout_minutes: 15,
      test_suites: ['unit'],
    },
  },
};

statusStoreMod.appendModuleLifecycleEvent(crashConfig, 'mod-crash', crashStatus, {
  eventType: 'module_attempt.started',
  oldStatus: 'PENDING',
  previousPhase: null,
  note: 'seed contract fixture open attempt',
  now: crashStatus.attempt_started_at,
});

const crashEventOffset = xaddEvents(sharedStreamKey).length;
const crashResult = await moduleRunnerMod.runModule(crashConfig, crashProgress, 'mod-crash', { deps: crashDeps });
assert.equal(
  crashResult.terminal?.status,
  'timed_out',
  'terminal Buster timeout exhaustion should preserve the typed timeout outcome',
);
await flushAsync();

const crashEvents = xaddEvents(sharedStreamKey)
  .slice(crashEventOffset)
  .filter((event) => contractEvents.has(event.type));
assert.deepEqual(crashEvents.map((event) => event.type), ['plugin.event', 'phase.started', 'module.status_changed', 'retry.exhausted', 'module.status_changed']);
assert.equal(crashEvents[0].plugin_id, 'builtin.worker.module_buster');
assert.equal(crashEvents[0].plugin_event, 'bridge_invoked');
assert.equal(crashEvents[0].module_id, 'mod-crash');
assert.equal(crashEvents[0].attempt, 1);
assert.equal(crashEvents[0].details.bridge_event_type, 'plugin.worker.module_buster.bridge_invoked');
assert.equal(crashEvents[1].module_id, 'mod-crash');
assert.equal(crashEvents[1].phase, 'buster');
assert.equal(crashEvents[2].module_id, 'mod-crash');
assert.equal(crashEvents[2].old_status, 'TESTING');
assert.equal(crashEvents[2].new_status, 'FAIL');
assert.equal(crashEvents[2].attempt, 1);
assert.equal(crashEvents[2].phase, 'buster');
assert.equal(crashEvents[2].model, 'buster-test-model');
assert.equal(crashEvents[2].reason, 'Buster timed out (15min)');
assert.equal(crashEvents[3].module_id, 'mod-crash');
assert.equal(crashEvents[3].attempt, 1);
assert.equal(crashEvents[3].phase, 'buster');
assert.equal(crashEvents[3].session_key, 'agent:crash:session');
assert.equal(crashEvents[3].max_attempts, 1);
assert.equal(crashEvents[3].max_fails, 1);
assert.equal(crashEvents[3].reason, 'Buster timed out (15min)');
assert.equal(crashEvents[4].module_id, 'mod-crash');
assert.equal(crashEvents[4].old_status, 'FAIL');
assert.equal(crashEvents[4].new_status, 'BLOCKED');
assert.equal(crashEvents[4].attempt, 1);
assert.equal(crashEvents[4].phase, 'buster');
assert.equal(crashEvents[4].reason, 'Buster crash retries exhausted after 1 attempt (Buster timed out (15min))');

const rateLimitMod = await importFresh(generalRoot, '/app/skills/pipeline/services/rate-limit.ts');
const rateLimitRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'check-telemetry-rate-limit-'));
const rateLimitSwarmDir = path.join(rateLimitRoot, '.swarm');
const rateLimitModulesDir = path.join(rateLimitSwarmDir, 'modules');
fs.mkdirSync(path.join(rateLimitModulesDir, 'mod-rate'), { recursive: true });
const rateLimitConfig = {
  ...config,
  rate_limit: { cooldown_hours: 0, max_pauses_per_module: 5, cooldown_buffer_ms: 0 },
  paths: { swarm_dir: rateLimitSwarmDir, modules_dir: rateLimitModulesDir },
  _progress: {
    modules: {
      'mod-rate': {
        dir: 'mod-rate',
        title: 'Module Rate Limited',
        stages: ['buster'],
      },
    },
  },
};
const rateLimitStatus = {
  module_id: 'mod-rate',
  title: 'Module Rate Limited',
  status: 'TESTING',
  current_phase: 'buster',
  fail_count: 0,
  fail_summaries: [],
  history: [],
  started_at: '2026-04-09T00:00:00.000Z',
  attempt_started_at: '2026-04-09T00:05:00.000Z',
  phase_started_at: '2026-04-09T00:06:00.000Z',
  cost: { total_duration_seconds: 0, attempt_duration_seconds: 0 },
  commit_hash: 'rate123',
  active_agent: {
    attempt: 1,
    model: 'buster-test-model',
    session_key: 'agent:buster:mod-rate',
  },
};
statusStoreMod.appendModuleLifecycleEvent(rateLimitConfig, 'mod-rate', rateLimitStatus, {
  eventType: 'module_attempt.started',
  oldStatus: 'PENDING',
  previousPhase: null,
  note: 'seed contract fixture open attempt',
  now: rateLimitStatus.attempt_started_at,
});
statusStoreMod.appendModuleLifecycleEvent(rateLimitConfig, 'mod-rate', rateLimitStatus, {
  eventType: 'module_attempt.testing_started',
  oldStatus: 'READY_FOR_TESTING',
  previousPhase: null,
  note: 'seed contract fixture buster phase',
  now: rateLimitStatus.phase_started_at,
});
const rateLimitEventOffset = xaddEvents(sharedStreamKey).length;
const trackedRateLimitStatus = rateLimitMod.buildTrackedModuleSessionRateLimitStatus(rateLimitConfig, 'mod-rate', { ...rateLimitStatus, reason: '429 Too Many Requests', rate_limit_reason: 'provider cooldown requested' });
await rateLimitMod.handleSessionRateLimit(rateLimitConfig, trackedRateLimitStatus, {
  ...rateLimitMod.createTrackedModuleSessionRateLimitRecoveryOptions(rateLimitConfig, 'mod-rate'),
  pauseCount: 1,
});
await flushAsync();

const rateLimitEvents = xaddEvents(sharedStreamKey).slice(rateLimitEventOffset);
assert.deepEqual(rateLimitEvents.map((event) => event.type), ['rate_limit.detected', 'module.status_changed', 'module.status_changed']);
assert.equal(rateLimitEvents[0].module_id, 'mod-rate');
assert.equal(rateLimitEvents[0].pause_count, 1);
assert.equal(rateLimitEvents[0].max_pauses, 5);
assert.equal(rateLimitEvents[1].module_id, 'mod-rate');
assert.equal(rateLimitEvents[1].old_status, 'TESTING');
assert.equal(rateLimitEvents[1].new_status, 'RATE_LIMITED');
assert.equal(rateLimitEvents[1].attempt, null);
assert.equal(rateLimitEvents[1].phase, 'buster');
assert.equal(rateLimitEvents[1].model, 'buster-test-model');
assert.equal(rateLimitEvents[1].commit_hash, 'rate123');
assert.equal(rateLimitEvents[1].reason, 'Paused 0h (rate limit)');
assert.equal(rateLimitEvents[2].module_id, 'mod-rate');
assert.equal(rateLimitEvents[2].old_status, 'RATE_LIMITED');
assert.equal(rateLimitEvents[2].new_status, 'TESTING');
assert.equal(rateLimitEvents[2].attempt, null);
assert.equal(rateLimitEvents[2].phase, 'buster');
assert.equal(rateLimitEvents[2].model, 'buster-test-model');
assert.equal(rateLimitEvents[2].commit_hash, 'rate123');
assert.equal(rateLimitEvents[2].reason, null);
const restoredRateLimitStatus = statusStoreMod.loadStatus(rateLimitConfig, 'mod-rate');
assert.equal(restoredRateLimitStatus.status, 'TESTING');
assert.equal(restoredRateLimitStatus.current_phase, 'buster');

assert.doesNotThrow(() => assertTelemetrySchemaHotspotAuthority(telemetrySchemaPath));
assert.equal(telemetrySchemaText.includes('Canonical event inventory, stream identity, envelope invariants, and compatibility boundaries live in `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md`.'), true);
assert.equal(telemetrySchemaText.includes('This schema is the authoritative event-by-event payload reference for those canonical event names, including authoritative field tables, payload examples, and event-specific correlation notes.'), true);
assert.equal(telemetrySchemaText.includes('The event sections below must remain in exact inventory parity with the contract and must not invent additional canonical event families.'), true);
assert.equal(telemetrySchemaText.includes('For the high-value lifecycle and observability events below, the field table is the authoritative payload surface. Examples and prose illustrate common combinations, but the field table owns the canonical payload field list and meanings.'), true);
assert.equal(telemetrySchemaText.includes('Valid statuses: `PENDING`, `IN_PROGRESS`, `READY_FOR_TESTING`, `TESTING`, `PASS`, `FAIL`, `BLOCKED`, `RATE_LIMITED`'), true);
assert.equal(telemetrySchemaText.includes('"new_status": "RATE_LIMITED"'), true);
assert.equal(telemetrySchemaText.includes('"reason": "Paused 2h (rate limit)"'), true);
assert.equal(telemetrySchemaText.includes('Session-backed agent observability is plugin-owned. Nova may request and target child sessions with `agent.spawn.requested` and `agent.delivery.target`, but runtime start/end/progress/transcript truth is promoted from the OpenClaw observer plugin through the agent-observability ingester.'), true);
assert.equal(telemetrySchemaText.includes('buster.task_started'), false);
assert.equal(telemetrySchemaText.includes('buster.task_completed'), false);
assert.equal(telemetrySchemaText.includes('When a spawned or terminated session belongs to gate-owned work and Nova supplied that identity to the observer path, observer-promoted lifecycle events preserve canonical `gate_type` and `dispatch_id` join keys alongside `gate_id`, `attempt`, and `session_key`.'), true);
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
if (previousRedisPassword === undefined) delete process.env.REDIS_PASSWORD;
else process.env.REDIS_PASSWORD = previousRedisPassword;
if (previousRedisHost === undefined) delete process.env.REDIS_HOST;
else process.env.REDIS_HOST = previousRedisHost;
if (previousRedisPort === undefined) delete process.env.REDIS_PORT;
else process.env.REDIS_PORT = previousRedisPort;

quietConsole.restore();
console.log(JSON.stringify({
  sourceRoot,
  overlayRoot,
  checkedEmitters: ['skills/buster', 'skills/nova/pipeline'],
  emittedEventNames: [...emitted].sort(),
  contractEventNames: [...contractEvents].sort(),
  sharedStreamKey,
  sharedSeqs: finalPipelineEvents.map((event) => event.seq),
}, null, 2));
