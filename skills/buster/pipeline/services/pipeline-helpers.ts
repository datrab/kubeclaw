import fs from 'fs';
import path from 'path';

import { getRepoRoot } from './git-workflows.ts';
import { resolveScopedPath } from '../security.ts';
import { createRunnerVerdict } from './verdict-schema.ts';
import { CLEANUP_POLICY, cleanupRuntimeResources } from './resource-cleanup.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
const ACTIVE_SESSION_STATE_FILE = path.join('.swarm', 'logs', 'buster', 'active-session.json');
const EMBED_FOOTER = { text: 'Buster Pipeline v2.0' };

export function resolveBusterActiveSessionPath(cwd = getRepoRoot()) {
  return path.join(path.resolve(cwd), ACTIVE_SESSION_STATE_FILE);
}

function normalizeIdentityValue(value) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (value === undefined), () => (value === null))), () => (value === ''))) return null;
  return String(value);
}

function firstNonEmptyString(values = [], defaultValue = null) {
  for (const value of values) {
    const normalized = normalizeIdentityValue(value);
    if (normalized !== null) return normalized;
  }
  return defaultValue;
}

function displayValue(value, missing = '—') {
  const normalized = normalizeIdentityValue(value);
  return normalized === null ? missing : normalized;
}

function buildCompletionKey({ runId = null, attempt = null, dispatchId = null, sessionKey = null } = {}) {
  const normalizedRunId = normalizeIdentityValue(runId);
  const normalizedAttempt = normalizeIdentityValue(attempt);
  const normalizedDispatchId = normalizeIdentityValue(dispatchId);
  const correlationId = normalizedDispatchId ? normalizedDispatchId : normalizeIdentityValue(sessionKey);
  if (selectTruthyValue(() => (selectTruthyValue(() => (!normalizedRunId), () => (!normalizedAttempt))), () => (!correlationId))) return null;
  return `${normalizedRunId}:${normalizedAttempt}:${correlationId}`;
}

export function buildCompletionIdentityFields(payload = {}, extra = {}) {
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

function validateCompletionIdentity(payload = {}, artifact = {}) {
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

function isAgentVerdictOutput(identity) {
  return identity.mismatched.length === 0 && identity.expected_count > 0 && identity.missing.length === identity.expected_count;
}

function resolveAgentVerdictFilePath(outputFilePath) {
  return `${outputFilePath}.agent-verdict.json`;
}

function retainAgentVerdict(outputFilePath, verdict = {}) {
  const agentVerdictPath = resolveAgentVerdictFilePath(outputFilePath);
  writeJsonFileAtomic(agentVerdictPath, {
    artifact_type: 'buster_agent_verdict',
    retained_from: path.basename(outputFilePath),
    retained_at: new Date().toISOString(),
    verdict,
  });
  return agentVerdictPath;
}

function normalizeNonNegativeInteger(value) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (value === undefined), () => (value === null))), () => (value === ''))) return null;
  const numeric = Number(value);
  if (selectTruthyValue(() => (!Number.isFinite(numeric)), () => (numeric < 0))) return null;
  return Math.trunc(numeric);
}

export function resolveBusterRateLimitMaxPauses(payload = {}, sessionResult = {}) {
  const candidate = sessionResult?.rate_limit_status?.max_rate_limit_pauses
  const normalized = normalizeNonNegativeInteger(candidate);
  if (normalized === null) throw new Error('Buster rate-limit completion requires explicit rate_limit.max_pauses policy');
  return normalized;
}

function writeJsonFileAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n');
  JSON.parse(fs.readFileSync(tmpPath, 'utf8'));
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
  const normalized = normalizeIdentityValue(value);
  const status = normalized === null ? null : normalized.toUpperCase();
  if (['PASS', 'FAIL'].includes(status)) return status;
  return null;
}

function isSupervisorOwnedFailure(result = {}) {
  return result?.source === 'session_monitor'
    && normalizeIdentityValue(result?.outcome)?.toUpperCase() !== 'PASS';
}

function isFailureSessionState(state) {
  const normalized = normalizeIdentityValue(state)?.trim().toLowerCase();
  return selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (normalized === 'error'), () => (normalized === 'errored'))), () => (normalized === 'failed'))), () => (normalized === 'failure'))), () => (normalized === 'aborted'))), () => (normalized === 'cancelled'))), () => (normalized === 'canceled'));
}

function isTerminalSessionFailure(sessionResult = {}) {
  if (!sessionResult?.terminal) return false;
  return [
    sessionResult?.failed === true,
    isFailureSessionState(sessionResult?.state?.sessionState),
    isFailureSessionState(sessionResult?.sessionState),
    ['session_terminal', 'transcript_error'].includes(sessionResult?.reason),
  ].some(Boolean);
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
  const artifact = {
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
  if (['run_id', 'attempt', 'dispatch_id', 'completion_key'].some(field => !artifact[field])) {
    throw new Error('Buster output_file artifact requires run_id, attempt, dispatch_id, and completion_key');
  }
  if (normalizeTerminalStatus(artifact.status) === null) {
    throw new Error('Buster output_file artifact status must be PASS or FAIL');
  }
  writeJsonFileAtomic(outputFilePath, artifact);
  return outputFilePath;
}

function completionTimestampAuthority(result) {
  if (typeof result.completed_at === 'string' && result.completed_at.trim()) return result.completed_at;
  return new Date().toISOString();
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
      if (isAgentVerdictOutput(identity) && result?.source === 'agent_verdict') {
        const agentVerdictPath = retainAgentVerdict(outputFilePath, existing.data);
        writeBusterOutputFile(payload, {
          status: result.outcome === 'PASS' ? 'PASS' : 'FAIL',
          summary: firstNonEmptyString([result.summary, existing.data?.summary], 'Buster agent verdict accepted'),
          reason: firstNonEmptyString([result.reason], result.outcome === 'PASS' ? 'agent_verdict_pass' : 'agent_verdict_fail'),
          data: {
            ...(result.data && typeof result.data === 'object' ? result.data : {}),
            agent_verdict_file: path.relative(path.dirname(outputFilePath), agentVerdictPath),
            agent_verdict_status: normalizeTerminalStatus(existing.data.status),
          },
        });
        return {
          ok: true,
          path: outputFilePath,
          source: 'written',
          status: result.outcome === 'PASS' ? 'PASS' : 'FAIL',
          replaced_reason: `agent_verdict_wrapped:${identity.missing.join(',')}`,
          agent_verdict_path: agentVerdictPath,
        };
      }
      if (isSupervisorOwnedFailure(result)) {
        writeBusterOutputFile(payload, {
          status: result.outcome === 'PASS' ? 'PASS' : 'FAIL',
          summary: firstNonEmptyString([result.summary, result.reason], 'Buster supervisor recorded terminal session failure'),
          reason: firstNonEmptyString([result.reason], 'agent_session_lifecycle_unstable'),
        });
        return {
          ok: true,
          path: outputFilePath,
          source: 'written',
          status: result.outcome === 'PASS' ? 'PASS' : 'FAIL',
          replaced_reason: `supervisor_owned_failure:${identity.mismatched.join(',')}`,
        };
      }
      return {
        ok: false,
        path: outputFilePath,
        source: 'existing',
        status: normalizeTerminalStatus(existing.data.status),
        reason: `output_file_identity_mismatch:${identity.mismatched.join(',')}`,
        mismatched: identity.mismatched,
      };
    }
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

export function resolveBusterAgentResult(payload = {}, sessionResult = {}, opts = {}) {
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
  if (!result.ok) {
    if (isTerminalSessionFailure(sessionResult)) {
      return {
        outcome: 'FAIL',
        reason: 'agent_session_lifecycle_unstable',
        summary: firstNonEmptyString([sessionResult?.detail, sessionResult?.state?.detail], 'Buster child session entered a terminal error state before writing a valid output_file'),
        source: 'session_monitor',
      };
    }
    if (!sessionResult?.terminal) {
      return {
        outcome: 'TIMEOUT',
        reason: firstNonEmptyString([sessionResult?.reason], 'session_timeout'),
        summary: firstNonEmptyString([sessionResult?.detail, sessionResult?.reason], 'Buster child session did not reach a terminal result'),
        source: 'session_monitor',
      };
    }
    return {
      outcome: 'FAIL',
      reason: result.reason,
      summary: result.summary,
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
    if (isAgentVerdictOutput(identity)) {
      const summary = firstNonEmptyString([result.data?.summary, result.data?.reason], `Buster ${status}`);
      return {
        outcome: status,
        reason: status === 'PASS' ? 'agent_verdict_pass' : 'agent_verdict_fail',
        summary,
        source: 'agent_verdict',
        data: {
          agent_verdict: result.data,
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
  const summary = firstNonEmptyString([result.data?.summary, result.data?.reason], `Buster ${status}`);
  return {
    outcome: status,
    reason: status === 'PASS' ? 'output_file_pass' : 'output_file_fail',
    summary,
    source: 'output_file',
  };
}

export function buildPreTestVerdict(moduleId, project, suitesInfo = {}) {
  const suiteResults = Array.isArray(suitesInfo?.results) ? suitesInfo.results : [];
  const suiteEntries = suiteResults
    .map((result) => {
      if (!result?.suite) return null;
      const { suite, duration_seconds, ...verdict } = result;
      return [suite, verdict];
    })
    .filter(Boolean);

  if (suiteEntries.length === 0) return null;
  return createRunnerVerdict(moduleId, project, Object.fromEntries(suiteEntries));
}

export function buildSuiteArtifactData(moduleId, project, suitesInfo = {}) {
  const preTestVerdict = buildPreTestVerdict(moduleId, project, suitesInfo);
  if (!preTestVerdict) return {};
  return {
    project,
    suite_summary: selectTruthyValue(() => (selectTruthyValue(() => (suitesInfo?.suiteSummary), () => (preTestVerdict.summary))), () => (null)),
    suite_detail_summary: selectTruthyValue(() => (suitesInfo?.suiteDetailSummary), () => (null)),
    results: Array.isArray(suitesInfo?.results) ? suitesInfo.results : [],
    suites: preTestVerdict.suites,
    verdict: preTestVerdict,
  };
}

/**
 * Build a suite results embed (PASS / FAIL style with inline findings).
 */
export function buildSuiteResultsEmbed(moduleId, project, suitesInfo, decision = {}) {
  const { suiteSummary, criticalFailed, results = [] } = suitesInfo;
  const pass = !criticalFailed;
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failEntries = results
    .filter(r => ['FAIL', 'ERROR'].includes(r.status))
    .map(r => {
      const findingList = Array.isArray(r.findings) ? r.findings : [];
      const findings = findingList
        .slice(0, 2)
        .map(f => selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (f?.description), () => (f?.message))), () => (f?.title))), () => ('missing_finding_detail')))
        .filter(Boolean)
        .join('; ');
      return {
        suite: r.suite,
        detail: firstNonEmptyString([r.error, r.top_finding, findings, r.reason], 'suite_failed_without_detail'),
      };
    });
  const failCount = failEntries.length;
  const passSuites = results.filter(r => r.status === 'PASS').map(r => r.suite);
  const skipSuites = results.filter(r => r.status === 'SKIP').map(r => r.suite);
  const truncate = (value, max = 1024) => {
    const s = displayValue(value);
    return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
  };
  const fields = [
    { name: 'Status',  value: pass ? 'PASS' : 'FAIL', inline: true },
    { name: 'Module',  value: String(moduleId),       inline: true },
    { name: 'Project', value: displayValue(project), inline: true },
    { name: 'Passed',  value: String(passCount),      inline: true },
    { name: 'Failed',  value: String(failCount),      inline: true },
  ];
  if (suiteSummary) {
    fields.push({ name: 'Summary', value: truncate(suiteSummary), inline: false });
  }
  if (decision?.recommendation) {
    fields.push({
      name: 'Buster Agent',
      value: decision.recommendation === 'SPAWN'
        ? 'Agent judgment enabled — spawning after deterministic suites passed'
        : pass
          ? 'Agent judgment disabled — deterministic suites are final authority'
          : 'Not spawned — deterministic suite failure is authoritative',
      inline: false,
    });
  }
  if (decision?.reason) {
    fields.push({ name: 'Decision Reason', value: truncate(decision.reason), inline: false });
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
  const agentRole = firstNonEmptyString([sessionData.agentRole, sessionData.agent_type], 'Buster')
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());
  return {
    title:  `🚀 ${agentRole} Session Spawned: ${moduleId}`,
    color:  3447003,
    fields: [
      { name: 'Status',  value: 'Spawned',                                  inline: true },
      { name: 'Module',  value: String(moduleId),                            inline: true },
      { name: 'Project', value: displayValue(project),                       inline: true },
      { name: 'Runtime', value: displayValue(sessionData.runtime, 'ACP'),     inline: true },
      { name: 'Session', value: displayValue(sessionData.childSessionKey),   inline: false },
    ],
    footer:    EMBED_FOOTER,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build a session complete embed (green for PASS, red for FAIL/TIMEOUT).
 * Includes commit hash and duration.
 */
export function buildSessionCompleteEmbed(moduleId, project, { outcome, reason, commitHash, durationSeconds, childSessionKey, source }) {
  const pass = outcome === 'PASS';
  const normalizedReason = String(reason ?? '');
  const outputContractFailure = ['output_file_contract_failed'].includes(normalizedReason)
    ? true
    : normalizedReason.startsWith('output_file_identity_mismatch');
  return {
    title:  pass
      ? `✅ Session Complete: PASS — ${moduleId}`
      : outputContractFailure
        ? `🚫 Buster Completion Contract Failed — ${moduleId}`
      : `❌ Session Complete: ${outcome} — ${moduleId}`,
    color:  pass ? 5763719 : 15158332,
    fields: [
      { name: 'Status',   value: String(outcome),                inline: true },
      { name: 'Module',   value: String(moduleId),               inline: true },
      { name: 'Project',  value: displayValue(project),          inline: true },
      { name: 'Duration', value: `${durationSeconds}s`,          inline: true },
      { name: 'Commit',   value: displayValue(commitHash),       inline: true },
      { name: 'Reason',   value: displayValue(reason),           inline: true },
      { name: 'Source',   value: displayValue(source),           inline: true },
      { name: 'Session',  value: displayValue(childSessionKey),  inline: false },
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
      { name: 'Project',  value: displayValue(project),          inline: true },
      { name: 'Elapsed',  value: `${elapsedSeconds}s`,           inline: true },
      { name: 'Timeout',  value: `${timeoutSeconds}s`,           inline: true },
      { name: 'Session',  value: displayValue(childSessionKey),  inline: false },
    ],
    footer:    EMBED_FOOTER,
    timestamp: new Date().toISOString(),
  };
}

export function buildTaskFailureEmbed(moduleId, project, { reason, stage, attempt, taskType, commitHash }) {
  const truncate = (value, max = 1024) => {
    const s = displayValue(value, 'missing_display_value');
    return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
  };

  return {
    title:  `🚨 Task Failure: ${moduleId}`,
    color:  15158332,
    fields: [
      { name: 'Status',  value: 'FAIL',                        inline: true },
      { name: 'Module',  value: String(moduleId),              inline: true },
      { name: 'Project', value: displayValue(project),         inline: true },
      { name: 'Stage',   value: displayValue(stage, 'missing_stage'), inline: true },
      { name: 'Attempt', value: displayValue(attempt),         inline: true },
      { name: 'Type',    value: displayValue(taskType, 'missing_task_type'), inline: true },
      { name: 'Commit',  value: displayValue(commitHash),      inline: true },
      { name: 'Reason',  value: truncate(reason),              inline: false },
    ],
    footer:    EMBED_FOOTER,
    timestamp: new Date().toISOString(),
  };
}

export async function doResourceCleanup(stage: string, payload: Record<string, any> = {}): Promise<any> {
  const hasScopedIdentity = payload && ['run_id', 'module_id', 'gate_id', 'dispatch_id'].some(field => payload[field]);
  const scopedPayload = hasScopedIdentity
    ? payload
    : null;
  const cleanupPolicy = scopedPayload
    ? CLEANUP_POLICY.TASK_SCOPED
    : stage === 'startup'
      ? CLEANUP_POLICY.STARTUP_SWEEP
      : stage === 'shutdown'
        ? CLEANUP_POLICY.SHUTDOWN_SWEEP
        : CLEANUP_POLICY.DISABLED;
  return cleanupRuntimeResources(stage, scopedPayload, { cleanupPolicy });
}
