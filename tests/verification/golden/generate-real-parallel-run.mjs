#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { buildCanonicalEnvelope, redactProhibitedSecrets } from '../../../skills/common/pipeline/observability-contract.ts';
import { publishArtifact, writeCanonicalJson } from '../../../skills/common/pipeline/portable-artifacts.ts';
import { appendEvaluationFact, buildRunManifest, finalizeEvidencePlane } from '../../../skills/nova/pipeline/services/evidence-plane.ts';

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}
function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}
function sessionMetadata(index, sessionKey) {
  return JSON.parse(fs.readFileSync(index, 'utf8'))[sessionKey];
}
function iso(milliseconds) {
  return new Date(milliseconds).toISOString();
}

const output = path.resolve(option('output') ?? 'tests/fixtures/observability-golden-run');
const index = path.resolve(option('session-index') ?? 'tests/verification/golden/source-sessions/index.json');
const sources = [
  { key: option('contract-key') ?? 'agent:codex:acp:f63543e2-306b-4d90-82ea-6feae602bebc', work_id: 'contract-probe', expected: { event_count: 53, requires_model_call_id: true, requires_tool_call_id: true } },
  { key: option('artifact-key') ?? 'agent:codex:acp:6d335e54-f117-49cf-a98e-ef15faa7b262', work_id: 'artifact-probe', expected: { export_copies_schemas: true, replay_reports_mismatches: true } },
];
if (fs.existsSync(output)) throw new Error(`output already exists: ${output}`);

const runId = 'real-parallel-observability-probe';
const swarmDir = path.join(output, '.swarm');
const pipelineDir = path.join(swarmDir, 'logs', 'pipeline');
const config = { project: 'pipeline-observability', run_id: runId, _runId: runId, repo_root: process.cwd(), paths: { swarm_dir: swarmDir } };
const runDir = path.join(pipelineDir, 'runs', runId);
fs.mkdirSync(path.join(runDir, 'lifecycle'), { recursive: true });
const records = sources.map(source => {
  const metadata = sessionMetadata(index, source.key);
  if (!metadata?.sessionFile) throw new Error(`session is missing: ${source.key}`);
  const sessionFile = path.isAbsolute(metadata.sessionFile) ? metadata.sessionFile : path.resolve(path.dirname(index), metadata.sessionFile);
  return { ...source, metadata, transcript: readJsonl(sessionFile) };
});
const startedAt = Math.min(...records.map(record => record.metadata.startedAt));
const endedAt = Math.max(...records.map(record => record.metadata.endedAt));
const overlap = Math.min(...records.map(record => record.metadata.endedAt)) - Math.max(...records.map(record => record.metadata.startedAt));
if (overlap <= 0) throw new Error('source sessions did not execute in parallel');

buildRunManifest(config, { modules: Object.fromEntries(records.map(record => [record.work_id, { owner: 'codex-acp', depends_on: [] }])) });
let seq = 0;
const events = [];
function emit(type, identity, payload, occurredAt) {
  events.push(buildCanonicalEnvelope({ type, identity, payload, seq: ++seq, occurredAt, emittedAt: occurredAt }));
}
const base = { project: config.project, run_id: runId, source: 'openclaw-session-store', producer: 'golden-run-importer' };
emit('pipeline.started', { ...base, work_id: 'pipeline', work_type: 'pipeline' }, { manifest_reference: 'run-manifest.json' }, iso(startedAt));
const lifecycle = [{ event_id: 'lifecycle-pipeline-start', type: 'pipeline.started', new_state: 'RUNNING', effective_at: iso(startedAt) }];
for (const record of records) {
  const assistant = record.transcript.find(item => item.type === 'message' && item.message?.role === 'assistant');
  const modelCallId = assistant?.id;
  const identity = { ...base, work_id: record.work_id, work_type: 'module', attempt: 1, dispatch_id: record.key, session_id: record.metadata.sessionId, agent_id: record.key, model_call_id: modelCallId };
  const admitted = `${record.transcript.map(item => JSON.stringify(redactProhibitedSecrets(item))).join('\n')}\n`;
  const transcript = publishArtifact(config, { logical_id: `transcript/${record.metadata.sessionId}`, kind: 'agent-transcript', media_type: 'application/x-ndjson', bytes: admitted, producer: 'golden-run-importer', content_class: 'payload', completeness: 'full', correlation: identity });
  emit('agent.session.started', identity, { parent_session_id: record.metadata.spawnedBy, label: record.metadata.label, transcript_reference: transcript.reference }, iso(record.metadata.startedAt));
  emit('agent.model.started', identity, { model: assistant?.message?.model, provider: assistant?.message?.provider }, assistant?.timestamp ?? iso(record.metadata.startedAt));
  emit('agent.model.ended', identity, { model: assistant?.message?.model, provider: assistant?.message?.provider, usage: assistant?.message?.usage, status: 'completed' }, assistant?.timestamp ?? iso(record.metadata.endedAt));
  emit('agent.session.ended', identity, { status: record.metadata.status, runtime_ms: record.metadata.runtimeMs, transcript_reference: transcript.reference }, iso(record.metadata.endedAt));
  lifecycle.push(
    { event_id: `lifecycle-${record.work_id}-start`, type: 'module.started', module_id: record.work_id, previous_state: 'PENDING', new_state: 'IN_PROGRESS', effective_at: iso(record.metadata.startedAt) },
    { event_id: `lifecycle-${record.work_id}-end`, type: 'module.completed', module_id: record.work_id, previous_state: 'IN_PROGRESS', new_state: 'PASS', effective_at: iso(record.metadata.endedAt) },
  );
  appendEvaluationFact(config, { dimension: 'parallel_agent_probe', work_id: record.work_id, session_id: record.metadata.sessionId, runtime_ms: record.metadata.runtimeMs, expected_source_facts: record.expected });
}
emit('producer.health', base, { producer_id: 'openclaw-acp', status: 'healthy', capability: { tool_calls: 'not_exposed_by_runtime' }, parallel_overlap_ms: overlap }, iso(endedAt));
emit('pipeline.completed', { ...base, work_id: 'pipeline', work_type: 'pipeline' }, { status: 'success', observability: 'complete' }, iso(endedAt));
lifecycle.push({ event_id: 'lifecycle-pipeline-end', type: 'pipeline.completed', previous_state: 'RUNNING', new_state: 'PASS', effective_at: iso(endedAt) });
fs.writeFileSync(path.join(runDir, 'pipeline.jsonl'), `${events.map(JSON.stringify).join('\n')}\n`);
fs.writeFileSync(path.join(runDir, 'lifecycle', 'canonical-events.jsonl'), `${lifecycle.map(JSON.stringify).join('\n')}\n`);
writeCanonicalJson(path.join(runDir, 'lifecycle', 'read-models.json'), { pipeline: { status: 'PASS' }, modules: Object.fromEntries(records.map(record => [record.work_id, { status: 'PASS' }])) });
const producers = [{ producer_id: 'openclaw-acp', status: 'healthy', last_successful_emission: iso(endedAt), lag: 0, checkpoint: String(seq), invalid_count: 0, quarantined_count: 0, dead_letter_count: 0, missing_payload_count: 0, restart_count: 0, reconciliation: { capability: { tool_calls: 'not_exposed_by_runtime' } } }];
const evidence = finalizeEvidencePlane(config, { progress: {}, producers, outcome: 'success', reason_code: 'PARALLEL_PROBE_COMPLETE', duration_ms: endedAt - startedAt });
writeCanonicalJson(path.join(output, 'expected-source-facts.json'), { schema_version: 'golden_source_facts.v1', real_parallel_run: true, parallel_overlap_ms: overlap, sessions: records.map(record => ({ session_id: record.metadata.sessionId, label: record.metadata.label, status: record.metadata.status, started_at: iso(record.metadata.startedAt), ended_at: iso(record.metadata.endedAt) })), source_limitation: 'ACP session persistence does not expose child tool calls; canonical tool events must never be fabricated.', observability: evidence.closure.observability });
process.stdout.write(`${JSON.stringify({ ok: true, run_dir: runDir, sessions: records.length, parallel_overlap_ms: overlap, events: events.length, observability: evidence.closure.observability })}\n`);
