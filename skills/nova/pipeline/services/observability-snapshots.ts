import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { costLogDir } from '../core/paths.ts';
import { observabilityRunId } from './observability-identity.ts';

export function recordUsageSnapshot(config: any, opts: Record<string, any> = {}) {
  const {
    agentType,
    moduleId,
    gateId,
    attempt,
    source,
    inputTokens,
    outputTokens,
    estimatedCostUsd,
    partial = false,
    sessionKey,
    eventId,
  } = opts;
  const logDir = costLogDir(config); if (!logDir) return;
  try {
    const snapshot = {
      ts: new Date().toISOString(),
      run_id: observabilityRunId(config),
      agent_type: agentType,
      ...(moduleId && { module_id: moduleId }),
      ...(gateId && { gate_id: gateId }),
      ...(attempt != null && { attempt }),
      ...(sessionKey && { session_key: sessionKey }),
      ...(eventId && { event_id: eventId }),
      source: source ?? 'missing_source',
      input_tokens: inputTokens ?? null,
      output_tokens: outputTokens ?? null,
      estimated_cost_usd: estimatedCostUsd ?? null,
      partial,
    };
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'usage-snapshots.jsonl'), JSON.stringify(snapshot) + '\n');
  } catch (e: any) {
    log('DEBUG', `[observability] recordUsageSnapshot failed (non-critical): ${e.message}`);
  }
}

export function hasUsageSnapshotEvent(config: any, eventId: string | null | undefined) {
  if (!eventId) return false;
  const logDir = costLogDir(config), snapshotsPath = logDir ? path.join(logDir, 'usage-snapshots.jsonl') : null;
  if (!snapshotsPath) return false;
  if (!fs.existsSync(snapshotsPath)) return false;

  try {
    const raw = fs.readFileSync(snapshotsPath, 'utf8').trim();
    if (!raw) return false;
    return raw.split('\n').filter(Boolean).some((line) => snapshotHasEventId(line, eventId));
  } catch (e: any) {
    log('DEBUG', `[observability] hasUsageSnapshotEvent failed (non-critical): ${e.message}`);
  }
  return false;
}

function snapshotHasEventId(line: string, eventId: string): boolean {
  try {
    return JSON.parse(line)?.event_id === eventId;
  } catch { /* INTENTIONAL_NONCRITICAL(optional_probe_failed): corrupt optional usage records do not match. */
    return false;
  }
}

// ── Usage aggregation ─────────────────────────────────────────────────────────
