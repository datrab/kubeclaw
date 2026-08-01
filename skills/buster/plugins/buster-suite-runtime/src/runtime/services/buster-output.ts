import fs from 'fs';
import path from 'path';
import { getRepoRoot } from './git-workflows.js';
import { resolveScopedPath } from '../security.js';
import { firstNonEmptyString, normalizeIdentityValue } from './pipeline-display.js';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';

type AnyRecord = Record<string, any>;
interface CompletionKeyInput { runId?: unknown; attempt?: unknown; dispatchId?: unknown; sessionKey?: unknown }
interface CompletionIdentity { ok: boolean; expected_count: number; missing: string[]; mismatched: string[] }

function buildCompletionKey({ runId = null, attempt = null, dispatchId = null, sessionKey = null }: CompletionKeyInput = {}): string | null {
  const normalizedRunId = normalizeIdentityValue(runId);
  const normalizedAttempt = normalizeIdentityValue(attempt);
  const normalizedDispatchId = normalizeIdentityValue(dispatchId);
  const correlationId = normalizedDispatchId ? normalizedDispatchId : normalizeIdentityValue(sessionKey);
  if (selectTruthyValue(() => (selectTruthyValue(() => (!normalizedRunId), () => (!normalizedAttempt))), () => (!correlationId))) return null;
  return `${normalizedRunId}:${normalizedAttempt}:${correlationId}`;
}

export function buildCompletionIdentityFields(payload: AnyRecord = {}, extra: AnyRecord = {}): AnyRecord {
  const runId = normalizeIdentityValue(payload?.run_id);
  const attempt = normalizeIdentityValue(payload?.attempt);
  const dispatchId = normalizeIdentityValue(payload?.dispatch_id);
  const gateId = normalizeIdentityValue(payload?.gate_id);
  const sessionKey = normalizeIdentityValue(selectDefinedValue(() => (extra.sessionKey), () => (payload?.session_key)));
  const completionKey = buildCompletionKey({ runId, attempt, dispatchId, sessionKey });

  return {
    ...(runId && { run_id: runId }),
    ...(attempt && { attempt }),
    ...(dispatchId && { dispatch_id: dispatchId }),
    ...(gateId && { gate_id: gateId }),
    ...(sessionKey && { session_key: sessionKey }),
    ...(completionKey && { completion_key: completionKey }),
  };
}

function validateCompletionIdentity(payload: AnyRecord = {}, artifact: AnyRecord = {}): CompletionIdentity {
  const expected = buildCompletionIdentityFields(payload);
  const missing = Object.keys(expected)
    .filter((field) => normalizeIdentityValue(artifact?.[field]) === null);
  const mismatched = Object.entries(expected)
    .filter(([field, value]) => {
      const actual = normalizeIdentityValue(artifact?.[field]);
      return actual !== null && actual !== value;
    })
    .map(([field]) => field);
  return {
    ok: missing.length === 0 && mismatched.length === 0,
    expected_count: Object.keys(expected).length,
    missing,
    mismatched,
  };
}

function isAgentVerdictOutput(identity: CompletionIdentity): boolean {
  return identity.mismatched.length === 0 && identity.expected_count > 0 && identity.missing.length === identity.expected_count;
}

function resolveAgentVerdictFilePath(outputFilePath: string): string {
  return `${outputFilePath}.agent-verdict.json`;
}

function retainAgentVerdict(outputFilePath: string, verdict: AnyRecord = {}): string {
  const agentVerdictPath = resolveAgentVerdictFilePath(outputFilePath);
  writeJsonFileAtomic(agentVerdictPath, {
    artifact_type: 'buster_agent_verdict',
    retained_from: path.basename(outputFilePath),
    retained_at: new Date().toISOString(),
    verdict,
  });
  return agentVerdictPath;
}

function normalizeNonNegativeInteger(value: unknown): number | null {
  if (selectTruthyValue(() => (selectTruthyValue(() => (value === undefined), () => (value === null))), () => (value === ''))) return null;
  const numeric = Number(value);
  if (selectTruthyValue(() => (!Number.isFinite(numeric)), () => (numeric < 0))) return null;
  return Math.trunc(numeric);
}

export function resolveBusterRateLimitMaxPauses(_payload: AnyRecord = {}, sessionResult: AnyRecord = {}): number {
  const candidate = sessionResult?.rate_limit_status?.max_rate_limit_pauses;
  const normalized = normalizeNonNegativeInteger(candidate);
  if (normalized === null) throw new Error('Buster rate-limit completion requires explicit rate_limit.max_pauses policy');
  return normalized;
}

function writeJsonFileAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n');
  JSON.parse(fs.readFileSync(tmpPath, 'utf8'));
  fs.renameSync(tmpPath, filePath);
}

function resolveRepoRelativePayloadPath(payload: AnyRecord = {}, field: string, label = field): string | null {
  const rel = payload?.[field];
  if (!rel) return null;
  if (path.isAbsolute(String(rel))) throw new Error(`${label} must be repository-relative: ${rel}`);
  const repoRoot = path.resolve(getRepoRoot());
  return resolveScopedPath(rel, {
    baseDir: repoRoot,
    scopeDir: repoRoot,
    field: label,
    scopeDescription: 'repository root',
  });
}

export function resolveBusterOutputFilePath(payload: AnyRecord = {}): string | null {
  return resolveRepoRelativePayloadPath(payload, 'output_file', 'output_file');
}

function normalizeTerminalStatus(value: unknown): 'PASS' | 'FAIL' | null {
  const normalized = normalizeIdentityValue(value);
  const status = normalized === null ? null : normalized.toUpperCase();
  if (status === 'PASS') return status;
  if (status === 'FAIL') return status;
  return null;
}

function isSupervisorOwnedFailure(result: AnyRecord = {}): boolean {
  return result?.source === 'session_monitor'
    && normalizeIdentityValue(result?.outcome)?.toUpperCase() !== 'PASS';
}

function isFailureSessionState(state: unknown): boolean {
  const normalized = normalizeIdentityValue(state)?.trim().toLowerCase();
  return selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (normalized === 'error'), () => (normalized === 'errored'))), () => (normalized === 'failed'))), () => (normalized === 'failure'))), () => (normalized === 'aborted'))), () => (normalized === 'cancelled'))), () => (normalized === 'canceled'));
}

function isTerminalSessionFailure(sessionResult: AnyRecord = {}): boolean {
  if (!sessionResult?.terminal) return false;
  return [
    sessionResult?.failed === true,
    isFailureSessionState(sessionResult?.state?.sessionState),
    isFailureSessionState(sessionResult?.sessionState),
    ['session_terminal', 'transcript_error'].includes(sessionResult?.reason),
  ].some(Boolean);
}

function readJsonResult(filePath: string | null, source: string): AnyRecord {
  if (!filePath) {
    return { ok: false, outcome: 'FAIL', reason: `${source}_path_missing`, summary: `${source} path missing`, source };
  }
  if (!fs.existsSync(filePath)) {
    return { ok: false, outcome: 'FAIL', reason: `${source}_missing`, summary: `${source} missing: ${filePath}`, source };
  }
  try {
    return { ok: true, data: JSON.parse(fs.readFileSync(filePath, 'utf8')), source, path: filePath };
  } catch (error) {
    return { ok: false, outcome: 'FAIL', reason: `${source}_invalid_json`, summary: `${source} invalid JSON: ${error instanceof Error ? error.message : String(error)}`, source };
  }
}

export function writeBusterOutputFile(payload: AnyRecord = {}, result: AnyRecord = {}): string {
  const outputFilePath = resolveBusterOutputFilePath(payload);
  if (!outputFilePath) throw new Error('Buster task payload missing required output_file');
  const artifact = buildOutputArtifact(payload, result);
  validateOutputArtifact(artifact);
  writeJsonFileAtomic(outputFilePath, artifact);
  return outputFilePath;
}

function buildOutputArtifact(payload: AnyRecord, result: AnyRecord): AnyRecord {
  const requestedStatus = result.status ? result.status : result.outcome;
  const status = String(requestedStatus ?? 'FAIL').toUpperCase() === 'PASS' ? 'PASS' : 'FAIL';
  const summary = firstNonEmptyString([result.summary, result.reason], `Buster ${status}`);
  const artifactData = result.data && typeof result.data === 'object' && !Array.isArray(result.data)
    ? result.data
    : {};
  return {
    ...artifactData,
    artifact_type: 'buster_output',
    task_type: selectTruthyValue(() => (payload?.task_type), () => (null)),
    module_id: payload?.module_id ? payload.module_id : payload?.module ? payload.module : null,
    ...buildCompletionIdentityFields(payload),
    status,
    summary,
    reason: selectTruthyValue(() => (result.reason), () => (null)),
    completed_at: completionTimestampAuthority(result),
  };
}

function validateOutputArtifact(artifact: AnyRecord): void {
  if (['run_id', 'attempt', 'dispatch_id', 'completion_key'].some(field => !artifact[field])) {
    throw new Error('Buster output_file artifact requires run_id, attempt, dispatch_id, and completion_key');
  }
  if (normalizeTerminalStatus(artifact.status) === null) throw new Error('Buster output_file artifact status must be PASS or FAIL');
}

function completionTimestampAuthority(result: AnyRecord): string {
  if (typeof result.completed_at === 'string' && result.completed_at.trim()) return result.completed_at;
  return new Date().toISOString();
}

export function clearBusterOutputFile(payload: AnyRecord = {}): AnyRecord {
  const outputFilePath = resolveBusterOutputFilePath(payload);
  if (!outputFilePath) throw new Error('Buster task payload missing required output_file');
  const existed = fs.existsSync(outputFilePath);
  if (existed) fs.rmSync(outputFilePath, { force: true });
  return { path: outputFilePath, removed: existed };
}

export function ensureBusterOutputFile(payload: AnyRecord = {}, result: AnyRecord = {}): AnyRecord {
  const outputFilePath = resolveBusterOutputFilePath(payload);
  if (!outputFilePath) throw new Error('Buster task payload missing required output_file');
  const existing = readJsonResult(outputFilePath, 'output_file');
  if (existing.ok && normalizeTerminalStatus(existing.data?.status)) {
    const identity = validateCompletionIdentity(payload, existing.data);
    if (!identity.ok) return replaceMismatchedOutput(payload, result, existing.data, outputFilePath, identity);
    return { ok: true, path: outputFilePath, source: 'existing', status: normalizeTerminalStatus(existing.data.status) };
  }
  writeBusterOutputFile(payload, {
    status: result.outcome === 'PASS' ? 'PASS' : 'FAIL',
    summary: firstNonEmptyString([result.summary, result.reason, existing.summary], 'Buster task failed before producing a valid output_file'),
    reason: firstNonEmptyString([result.reason, existing.reason]),
    data: result.data && typeof result.data === 'object' ? result.data : {},
  });
  return { ok: true, path: outputFilePath, source: 'written', status: result.outcome === 'PASS' ? 'PASS' : 'FAIL', replaced_reason: selectTruthyValue(() => (existing.reason), () => (null)) };
}

function replaceMismatchedOutput(payload: AnyRecord, result: AnyRecord, existing: AnyRecord, outputPath: string, identity: CompletionIdentity): AnyRecord {
  const status = result.outcome === 'PASS' ? 'PASS' : 'FAIL';
  if (isAgentVerdictOutput(identity) && result.source === 'agent_verdict') {
    const agentVerdictPath = retainAgentVerdict(outputPath, existing);
    writeBusterOutputFile(payload, { status, summary: firstNonEmptyString([result.summary, existing.summary], 'Buster agent verdict accepted'),
      reason: firstNonEmptyString([result.reason], status === 'PASS' ? 'agent_verdict_pass' : 'agent_verdict_fail'),
      data: { ...(result.data && typeof result.data === 'object' ? result.data : {}), agent_verdict_file: path.relative(path.dirname(outputPath), agentVerdictPath), agent_verdict_status: normalizeTerminalStatus(existing.status) } });
    return { ok: true, path: outputPath, source: 'written', status, replaced_reason: `agent_verdict_wrapped:${identity.missing.join(',')}`, agent_verdict_path: agentVerdictPath };
  }
  if (isSupervisorOwnedFailure(result)) {
    writeBusterOutputFile(payload, { status, summary: firstNonEmptyString([result.summary, result.reason], 'Buster supervisor recorded terminal session failure'), reason: firstNonEmptyString([result.reason], 'agent_session_lifecycle_unstable') });
    return { ok: true, path: outputPath, source: 'written', status, replaced_reason: `supervisor_owned_failure:${identity.mismatched.join(',')}` };
  }
  return { ok: false, path: outputPath, source: 'existing', status: normalizeTerminalStatus(existing.status), reason: `output_file_identity_mismatch:${identity.mismatched.join(',')}`, mismatched: identity.mismatched };
}

export function resolveBusterAgentResult(payload: AnyRecord = {}, sessionResult: AnyRecord = {}, opts: AnyRecord = {}): AnyRecord {
  if (sessionResult?.reason === 'rate_limited') {
    return {
      outcome: 'RATE_LIMITED',
      reason: 'max_pauses_exceeded',
      summary: firstNonEmptyString([sessionResult?.detail], 'Buster child session exceeded rate-limit pause budget'),
      source: 'session_monitor',
    };
  }

  const outputFilePath = resolveBusterOutputFilePath(payload);
  if (!outputFilePath) {
    return {
      outcome: 'FAIL',
      reason: 'output_file_missing',
      summary: 'Buster output_file is required and was not provided',
      source: 'output_file',
    };
  }
  const result = readJsonResult(outputFilePath, 'output_file');
  if (!result.ok) return missingOutputResult(sessionResult, result);
  return validatedOutputResult(payload, result.data);
}

function missingOutputResult(sessionResult: AnyRecord, readResult: AnyRecord): AnyRecord {
  if (isTerminalSessionFailure(sessionResult)) return { outcome: 'FAIL', reason: 'agent_session_lifecycle_unstable',
    summary: firstNonEmptyString([sessionResult.detail, sessionResult.state?.detail], 'Buster child session entered a terminal error state before writing a valid output_file'), source: 'session_monitor' };
  if (!sessionResult.terminal) return { outcome: 'TIMEOUT', reason: firstNonEmptyString([sessionResult.reason], 'session_timeout'),
    summary: firstNonEmptyString([sessionResult.detail, sessionResult.reason], 'Buster child session did not reach a terminal result'), source: 'session_monitor' };
  return { outcome: 'FAIL', reason: readResult.reason, summary: readResult.summary, source: 'output_file' };
}

function validatedOutputResult(payload: AnyRecord, data: AnyRecord): AnyRecord {
  const status = normalizeTerminalStatus(data.status);
  if (!status) {
    return {
      outcome: 'FAIL',
      reason: 'output_file_invalid_status',
      summary: 'Buster output_file must contain status PASS or FAIL',
      source: 'output_file',
    };
  }
  const identity = validateCompletionIdentity(payload, data);
  if (!identity.ok) {
    if (isAgentVerdictOutput(identity)) {
      const summary = firstNonEmptyString([data.summary, data.reason], `Buster ${status}`);
      return {
        outcome: status,
        reason: status === 'PASS' ? 'agent_verdict_pass' : 'agent_verdict_fail',
        summary,
        source: 'agent_verdict',
        data: {
          agent_verdict: data,
        },
      };
    }
    return {
      outcome: 'FAIL',
      reason: 'output_file_identity_mismatch',
      summary: `Buster output_file identity mismatch: ${identity.mismatched.join(', ')}`,
      source: 'output_file',
    };
  }
  const summary = firstNonEmptyString([data.summary, data.reason], `Buster ${status}`);
  return {
    outcome: status,
    reason: status === 'PASS' ? 'output_file_pass' : 'output_file_fail',
    summary,
    source: 'output_file',
  };
}
