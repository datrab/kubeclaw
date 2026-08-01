import fs from 'fs';
import path from 'path';
import { sanitizeTelemetryPayload } from '../egress.js';
import { buildCanonicalEnvelope, sha256 } from '../observability-contract.js';
import { reportBusterTelemetryIncident } from './telemetry-incidents.js';
import type { BusterTelemetryContext, TelemetryRecord } from './telemetry-contracts.js';

function authority(...values: unknown[]): any {
  for (const value of values) if (value !== undefined && value !== null && value !== '') return value;
  return null;
}

function canonicalIdentity(ctx: BusterTelemetryContext, payload: TelemetryRecord): TelemetryRecord {
  const gateId = ctx.gateId;
  const moduleId = gateId ? null : authority(payload.module_id, ctx.moduleId);
  return { project: ctx.project, run_id: ctx.runId, work_id: authority(gateId, moduleId, ctx.runId),
    work_type: gateId ? 'gate' : moduleId ? 'module' : 'pipeline', module_id: moduleId, gate_id: gateId,
    gate_type: gateId ? ctx.gateType : null, attempt: payload.attempt, dispatch_id: payload.dispatch_id,
    session_id: payload.session_key, agent_id: null, model_call_id: payload.model_call_id, tool_call_id: payload.tool_call_id,
    source: 'buster', producer: ctx.emitter };
}

export function buildTelemetryEnvelope(ctx: BusterTelemetryContext, type: string, data: TelemetryRecord = {}, seq: number | null): TelemetryRecord {
  const payload: TelemetryRecord = { ...data, module_id: ctx.gateId ? null : authority(ctx.moduleId),
    attempt: authority(data.attempt, ctx.attempt), dispatch_id: authority(data.dispatch_id, ctx.dispatchId),
    session_key: authority(data.session_key, ctx.sessionKey) };
  delete payload.project; delete payload.run_id; delete payload.source; delete payload.emitter;
  if (seq === null) {
    const original = JSON.stringify(payload);
    return { schema_version: 'quarantined_payload.v1', quarantine_id: `quarantine_${sha256(`${type}\0${original}`)}`,
      quarantined_at: new Date().toISOString(), reason_code: 'TRANSPORT_UNAVAILABLE', intended_type: type,
      project: ctx.project, run_id: ctx.runId, producer: ctx.emitter, original_sha256: sha256(original) };
  }
  return buildCanonicalEnvelope({ type, payload, seq, identity: canonicalIdentity(ctx, payload) });
}

function quarantineCorrelation(ctx: Partial<BusterTelemetryContext>, data: TelemetryRecord): TelemetryRecord {
  const gateId = authority(data.gate_id, ctx.gateId);
  return { module_id: Object.hasOwn(data, 'module_id') ? data.module_id : gateId ? null : authority(ctx.moduleId),
    gate_id: gateId, gate_type: gateId ? authority(data.gate_type, ctx.gateType) : undefined,
    attempt: authority(data.attempt, ctx.attempt), dispatch_id: authority(data.dispatch_id, ctx.dispatchId),
    session_key: authority(data.session_key, ctx.sessionKey) };
}

export function appendQuarantinedEvent(ctx: BusterTelemetryContext, type: string, data: TelemetryRecord = {}): void {
  const targets: string[] = [];
  if (ctx.logDir) targets.push(path.join(ctx.logDir, 'quarantine.jsonl'));
  if (ctx.pipelineLogPath) targets.push(path.join(path.dirname(ctx.pipelineLogPath), 'quarantine.jsonl'));
  if (ctx.pipelineRunLogPath) targets.push(path.join(path.dirname(ctx.pipelineRunLogPath), 'quarantine.jsonl'));
  try {
    const payload = { ...quarantineCorrelation(ctx, data), ...sanitizeTelemetryPayload(data) };
    const serialized = JSON.stringify(payload);
    const record = { schema_version: 'quarantined_payload.v1', quarantine_id: `quarantine_${sha256(`${type}\0${serialized}`)}`,
      quarantined_at: new Date().toISOString(), reason_code: 'REDIS_TELEMETRY_UNAVAILABLE', intended_type: type,
      project: ctx.project, run_id: ctx.runId, producer: ctx.emitter, original_byte_length: new TextEncoder().encode(serialized).byteLength,
      original_sha256: sha256(serialized) };
    for (const target of new Set(targets)) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.appendFileSync(target, `${JSON.stringify(record)}\n`); }
  } catch (error) { reportBusterTelemetryIncident(ctx, 'quarantine_write_failed', error, 'Buster telemetry quarantine write failed', { scope: type }); }
}

export function appendPipelineArtifactEvent(ctx: BusterTelemetryContext, event: TelemetryRecord | null): void {
  const targets = [ctx.pipelineLogPath, ctx.pipelineRunLogPath].filter((target): target is string => Boolean(target));
  if (!event || targets.length === 0) return;
  try { for (const target of targets) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.appendFileSync(target, `${JSON.stringify(event)}\n`); } }
  catch (error) { reportBusterTelemetryIncident(ctx, 'pipeline_artifact_write_failed', error, 'Buster telemetry pipeline artifact mirror write failed', { scope: event.type || 'missing_event_type' }); }
}
