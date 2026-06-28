import fs from 'fs';
import path from 'path';

import { getRepoRoot } from './git-workflows.ts';
import { resolveScopedPath } from '../security.ts';
import { createRunnerVerdict } from './verdict-schema.ts';
import { CLEANUP_POLICY, cleanupSandboxResources } from './sandbox-cleanup.ts';

const ACTIVE_SESSION_STATE_FILE = path.join('.swarm', 'logs', 'buster', 'active-session.json');
const EMBED_FOOTER = { text: 'Buster Pipeline v2.0' };

export function resolveBusterActiveSessionPath(cwd = getRepoRoot()) {
  return path.join(path.resolve(cwd), ACTIVE_SESSION_STATE_FILE);
}

function normalizeIdentityValue(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function buildCompletionKey({ runId = null, attempt = null, dispatchId = null, sessionKey = null } = {}) {
  const normalizedRunId = normalizeIdentityValue(runId);
  const normalizedAttempt = normalizeIdentityValue(attempt);
  const normalizedDispatchId = normalizeIdentityValue(dispatchId);
  const correlationId = normalizedDispatchId ? normalizedDispatchId : normalizeIdentityValue(sessionKey);
  if (!normalizedRunId || !normalizedAttempt) return null;
  return `${normalizedRunId}:${normalizedAttempt}:${correlationId || 'unscoped'}`;
}

export function buildCompletionIdentityFields(payload = {}, extra = {}) {
  const runId = normalizeIdentityValue(extra.runId ?? payload?.run_id);
  const attempt = normalizeIdentityValue(extra.attempt ?? payload?.attempt);
  const dispatchId = normalizeIdentityValue(extra.dispatchId ?? payload?.dispatch_id);
  const gateId = normalizeIdentityValue(extra.gateId ?? payload?.gate_id);
  const sessionKey = normalizeIdentityValue(extra.sessionKey ?? null);
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

function validateCompletionIdentity(payload = {}, artifact = {}) {
  const expected = buildCompletionIdentityFields(payload);
  const mismatched = Object.entries(expected)
    .filter(([field, value]) => normalizeIdentityValue(artifact?.[field]) !== value)
    .map(([field]) => field);
  return {
    ok: mismatched.length === 0,
    mismatched,
  };
}

function normalizeNonNegativeInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.trunc(numeric);
}

export function resolveBusterRateLimitMaxPauses(payload = {}, sessionResult = {}) {
  const candidate = sessionResult?.rate_limit_status?.max_rate_limit_pauses ?? payload?.rate_limit?.max_pauses;
  const normalized = normalizeNonNegativeInteger(candidate);
  if (normalized === null) throw new Error('Buster rate-limit completion requires explicit rate_limit.max_pauses policy');
  return normalized;
}

function writeJsonFileAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmpPath, filePath);
}

function resolveRepoRelativePayloadPath(payload = {}, field, label = field) {
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

export function resolveBusterOutputFilePath(payload = {}) {
  return resolveRepoRelativePayloadPath(payload, 'output_file', 'output_file');
}

function normalizeTerminalStatus(value) {
  const status = normalizeIdentityValue(value)?.toUpperCase() || null;
  if (status === 'PASS' || status === 'FAIL') return status;
  return null;
}

function readJsonResult(filePath, source) {
  if (!filePath) {
    return { ok: false, outcome: 'FAIL', reason: `${source}_path_missing`, summary: `${source} path missing`, source };
  }
  if (!fs.existsSync(filePath)) {
    return { ok: false, outcome: 'FAIL', reason: `${source}_missing`, summary: `${source} missing: ${filePath}`, source };
  }
  try {
    return { ok: true, data: JSON.parse(fs.readFileSync(filePath, 'utf8')), source, path: filePath };
  } catch (error) {
    return { ok: false, outcome: 'FAIL', reason: `${source}_invalid_json`, summary: `${source} invalid JSON: ${error.message}`, source };
  }
}

export function writeBusterOutputFile(payload = {}, result = {}) {
  const outputFilePath = resolveBusterOutputFilePath(payload);
  if (!outputFilePath) throw new Error('Buster task payload missing required output_file');
  const rawResultStatus = result.status ? result.status : result.outcome ? result.outcome : 'FAIL';
  const rawStatus = String(rawResultStatus).toUpperCase();
  const status = rawStatus === 'PASS' ? 'PASS' : 'FAIL';
  const summary = result.summary ? result.summary : result.reason ? result.reason : `Buster ${status}`;
  const artifactData = result.data && typeof result.data === 'object' && !Array.isArray(result.data)
    ? result.data
    : {};
  writeJsonFileAtomic(outputFilePath, {
    ...artifactData,
    artifact_type: 'buster_output',
    task_type: payload?.task_type || null,
    module_id: payload?.module_id ? payload.module_id : payload?.module ? payload.module : null,
    ...buildCompletionIdentityFields(payload),
    status,
    summary,
    reason: result.reason || null,
    completed_at: result.completed_at || new Date().toISOString(),
  });
  return outputFilePath;
}

export function clearBusterOutputFile(payload = {}) {
  const outputFilePath = resolveBusterOutputFilePath(payload);
  if (!outputFilePath) throw new Error('Buster task payload missing required output_file');
  const existed = fs.existsSync(outputFilePath);
  if (existed) fs.rmSync(outputFilePath, { force: true });
  return { path: outputFilePath, removed: existed };
}

export function ensureBusterOutputFile(payload = {}, result = {}) {
  const outputFilePath = resolveBusterOutputFilePath(payload);
  if (!outputFilePath) throw new Error('Buster task payload missing required output_file');
  const existing = readJsonResult(outputFilePath, 'output_file');
  if (existing.ok && normalizeTerminalStatus(existing.data?.status)) {
    const identity = validateCompletionIdentity(payload, existing.data);
    if (!identity.ok) {
      writeBusterOutputFile(payload, {
        status: result.outcome === 'PASS' ? 'PASS' : 'FAIL',
        summary: result.summary || result.reason || 'Buster task ignored stale output_file identity',
        reason: `output_file_identity_mismatch:${identity.mismatched.join(',')}`,
      });
      return { ok: true, path: outputFilePath, source: 'written', status: result.outcome === 'PASS' ? 'PASS' : 'FAIL', replaced_reason: 'output_file_identity_mismatch' };
    }
    return { ok: true, path: outputFilePath, source: 'existing', status: normalizeTerminalStatus(existing.data.status) };
  }
  writeBusterOutputFile(payload, {
    status: result.outcome === 'PASS' ? 'PASS' : 'FAIL',
    summary: result.summary || result.reason || existing.summary || 'Buster task failed before producing a valid output_file',
    reason: result.reason || existing.reason || null,
  });
  return { ok: true, path: outputFilePath, source: 'written', status: result.outcome === 'PASS' ? 'PASS' : 'FAIL', replaced_reason: existing.reason || null };
}

export function resolveBusterAgentResult(payload = {}, sessionResult = {}, opts = {}) {
  if (sessionResult?.reason === 'rate_limited') {
    return {
      outcome: 'RATE_LIMITED',
      reason: 'max_pauses_exceeded',
      summary: sessionResult?.detail || 'Buster child session exceeded rate-limit pause budget',
      source: 'session_monitor',
    };
  }

  if (!sessionResult?.terminal) {
    return {
      outcome: 'TIMEOUT',
      reason: sessionResult?.reason || 'session_timeout',
      summary: sessionResult?.detail || sessionResult?.reason || 'Buster child session did not reach a terminal result',
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
  if (!result.ok) {
    return {
      outcome: 'FAIL',
      reason: result.reason || 'output_file_missing',
      summary: result.summary || `Buster output_file missing: ${outputFilePath}`,
      source: 'output_file',
    };
  }
  const status = normalizeTerminalStatus(result.data?.status);
  if (!status) {
    return {
      outcome: 'FAIL',
      reason: 'output_file_invalid_status',
      summary: 'Buster output_file must contain status PASS or FAIL',
      source: 'output_file',
    };
  }
  const identity = validateCompletionIdentity(payload, result.data);
  if (!identity.ok) {
    if (opts?.repairOutputFileIdentity === true) {
      writeBusterOutputFile(payload, {
        data: result.data,
        status,
        summary: result.data?.summary || result.data?.reason || `Buster ${status}`,
        reason: result.data?.reason || null,
        completed_at: result.data?.completed_at || new Date().toISOString(),
      });
      return {
        outcome: status,
        reason: status === 'PASS' ? 'output_file_pass' : 'output_file_fail',
        summary: result.data?.summary || result.data?.reason || `Buster ${status}`,
        source: 'output_file',
        repaired_identity: true,
      };
    }
    return {
      outcome: 'FAIL',
      reason: 'output_file_identity_mismatch',
      summary: `Buster output_file identity mismatch: ${identity.mismatched.join(', ')}`,
      source: 'output_file',
    };
  }
  const summary = result.data?.summary || result.data?.reason || `Buster ${status}`;
  return {
    outcome: status,
    reason: status === 'PASS' ? 'output_file_pass' : 'output_file_fail',
    summary,
    source: 'output_file',
  };
}

export function buildPreTestVerdict(moduleId, project, suitesInfo = {}) {
  const suiteEntries = (suitesInfo?.results || [])
    .map((result) => {
      if (!result?.suite) return null;
      const { suite, duration_seconds, ...verdict } = result;
      return [suite, verdict];
    })
    .filter(Boolean);

  if (suiteEntries.length === 0) return null;
  return createRunnerVerdict(moduleId, project, Object.fromEntries(suiteEntries));
}

/**
 * Build a suite results embed (PASS / FAIL style with inline findings).
 */
export function buildSuiteResultsEmbed(moduleId, project, suitesInfo) {
  const { suiteSummary, criticalFailed, results = [] } = suitesInfo;
  const pass = !criticalFailed;
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failEntries = results
    .filter(r => r.status === 'FAIL' || r.status === 'ERROR')
    .map(r => {
      const findings = (r.findings || [])
        .slice(0, 2)
        .map(f => f?.description || f?.message || f?.title || 'unknown')
        .filter(Boolean)
        .join('; ');
      return {
        suite: r.suite,
        detail: r.error || r.top_finding || findings || r.reason || 'failed',
      };
    });
  const failCount = failEntries.length;
  const passSuites = results.filter(r => r.status === 'PASS').map(r => r.suite);
  const skipSuites = results.filter(r => r.status === 'SKIP').map(r => r.suite);
  const truncate = (value, max = 1024) => {
    const s = String(value || '—');
    return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
  };
  const fields = [
    { name: 'Status',  value: pass ? 'PASS' : 'FAIL', inline: true },
    { name: 'Module',  value: String(moduleId),       inline: true },
    { name: 'Project', value: String(project || '—'), inline: true },
    { name: 'Passed',  value: String(passCount),      inline: true },
    { name: 'Failed',  value: String(failCount),      inline: true },
  ];
  if (suiteSummary) {
    fields.push({ name: 'Summary', value: truncate(suiteSummary), inline: false });
  }
  if (passSuites.length) {
    fields.push({ name: 'Passed Suites', value: truncate(passSuites.join(', ')), inline: false });
  }
  if (failEntries.length) {
    fields.push({ name: 'Failed Suites', value: truncate(failEntries.map(r => r.suite).join(', ')), inline: false });
    fields.push({ name: 'Issue', value: truncate(failEntries.map(r => `${r.suite}: ${r.detail}`).join('\n')), inline: false });
  }
  if (skipSuites.length) {
    fields.push({ name: 'Skipped Suites', value: truncate(skipSuites.join(', ')), inline: false });
  }
  return {
    title:     pass ? `✅ Suite Results: PASS — ${moduleId}` : `🚫 Suite Results: FAIL — ${moduleId}`,
    color:     pass ? 5763719 : 15158332,
    fields,
    footer:    EMBED_FOOTER,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build a session spawn embed (info blue, includes runtime type).
 */
export function buildSessionSpawnEmbed(moduleId, project, sessionData) {
  const agentRole = String(sessionData.agentRole || sessionData.agent_type || 'Buster')
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());
  return {
    title:  `🚀 ${agentRole} Session Spawned: ${moduleId}`,
    color:  3447003,
    fields: [
      { name: 'Status',  value: 'Spawned',                                  inline: true },
      { name: 'Module',  value: String(moduleId),                            inline: true },
      { name: 'Project', value: String(project || '—'),                      inline: true },
      { name: 'Runtime', value: String(sessionData.runtime || 'ACP'),        inline: true },
      { name: 'Session', value: String(sessionData.childSessionKey || '—'),  inline: false },
    ],
    footer:    EMBED_FOOTER,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build a session complete embed (green for PASS, red for FAIL/TIMEOUT).
 * Includes commit hash and duration.
 */
export function buildSessionCompleteEmbed(moduleId, project, { outcome, reason, commitHash, durationSeconds, childSessionKey }) {
  const pass = outcome === 'PASS';
  return {
    title:  pass
      ? `✅ Session Complete: PASS — ${moduleId}`
      : `❌ Session Complete: ${outcome} — ${moduleId}`,
    color:  pass ? 5763719 : 15158332,
    fields: [
      { name: 'Status',   value: String(outcome),                inline: true },
      { name: 'Module',   value: String(moduleId),               inline: true },
      { name: 'Project',  value: String(project || '—'),         inline: true },
      { name: 'Duration', value: `${durationSeconds}s`,          inline: true },
      { name: 'Commit',   value: String(commitHash || '—'),      inline: true },
      { name: 'Reason',   value: String(reason || '—'),          inline: true },
      { name: 'Session',  value: String(childSessionKey || '—'), inline: false },
    ],
    footer:    EMBED_FOOTER,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build a timeout embed (red, shows elapsed vs timeout comparison).
 */
export function buildTimeoutEmbed(moduleId, project, { elapsedSeconds, timeoutSeconds, childSessionKey }) {
  return {
    title:  `⏱️ Session Timeout: ${moduleId}`,
    color:  15158332,
    fields: [
      { name: 'Status',   value: 'TIMEOUT',                      inline: true },
      { name: 'Module',   value: String(moduleId),               inline: true },
      { name: 'Project',  value: String(project || '—'),         inline: true },
      { name: 'Elapsed',  value: `${elapsedSeconds}s`,           inline: true },
      { name: 'Timeout',  value: `${timeoutSeconds}s`,           inline: true },
      { name: 'Session',  value: String(childSessionKey || '—'), inline: false },
    ],
    footer:    EMBED_FOOTER,
    timestamp: new Date().toISOString(),
  };
}

export function buildTaskFailureEmbed(moduleId, project, { reason, stage, attempt, taskType, commitHash }) {
  const truncate = (value, max = 1024) => {
    const s = String(value || 'unknown');
    return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
  };

  return {
    title:  `🚨 Task Failure: ${moduleId}`,
    color:  15158332,
    fields: [
      { name: 'Status',  value: 'FAIL',                        inline: true },
      { name: 'Module',  value: String(moduleId),              inline: true },
      { name: 'Project', value: String(project || '—'),        inline: true },
      { name: 'Stage',   value: String(stage || 'unknown'),    inline: true },
      { name: 'Attempt', value: String(attempt ?? '—'),        inline: true },
      { name: 'Type',    value: String(taskType || 'unknown'), inline: true },
      { name: 'Commit',  value: String(commitHash || '—'),     inline: true },
      { name: 'Reason',  value: truncate(reason),              inline: false },
    ],
    footer:    EMBED_FOOTER,
    timestamp: new Date().toISOString(),
  };
}

export async function doSandboxCleanup(stage: string, payload: Record<string, any> = {}): Promise<any> {
  const scopedPayload = payload && (payload.run_id || payload.module_id || payload.gate_id || payload.dispatch_id)
    ? payload
    : null;
  const cleanupPolicy = scopedPayload
    ? CLEANUP_POLICY.TASK_SCOPED
    : stage === 'startup'
      ? CLEANUP_POLICY.STARTUP_SWEEP
      : stage === 'shutdown'
        ? CLEANUP_POLICY.SHUTDOWN_SWEEP
        : CLEANUP_POLICY.DISABLED;
  return cleanupSandboxResources(stage, scopedPayload, { cleanupPolicy });
}
