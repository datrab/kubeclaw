import fs from 'fs';
import path from 'path';

import { getRepoRoot } from './pipeline/services/git.js';
import { clearModuleActiveAgent, setModuleActiveAgent } from '../common/pipeline/lifecycle-state.js';
import { createRunnerVerdict } from './verdict-schema.js';
import { cleanupSandboxResources } from './pipeline/services/sandbox-cleanup.js';

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
  const correlationId = normalizeIdentityValue(dispatchId) || normalizeIdentityValue(sessionKey);
  if (!normalizedRunId || !normalizedAttempt) return null;
  return `${normalizedRunId}:${normalizedAttempt}:${correlationId || 'unscoped'}`;
}

export function buildCompletionIdentityFields(payload = {}, extra = {}) {
  const runId = normalizeIdentityValue(extra.runId ?? payload?.run_id);
  const attempt = normalizeIdentityValue(extra.attempt ?? payload?.attempt);
  const dispatchId = normalizeIdentityValue(extra.dispatchId ?? payload?.dispatch_id ?? payload?.session?.label);
  const sessionKey = normalizeIdentityValue(extra.sessionKey ?? null);
  const completionKey = buildCompletionKey({ runId, attempt, dispatchId, sessionKey });

  return {
    ...(runId && { run_id: runId }),
    ...(attempt && { attempt }),
    ...(dispatchId && { dispatch_id: dispatchId }),
    ...(sessionKey && { session_key: sessionKey }),
    ...(completionKey && { completion_key: completionKey }),
  };
}

function writeJsonFileAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmpPath, filePath);
}

export function resolveStatusJsonPath(payload = {}) {
  const rel = payload?.status_json_path;
  if (!rel) return null;
  const repoRoot = path.resolve(getRepoRoot());
  const resolved = path.resolve(repoRoot, rel);
  if (resolved !== repoRoot && !resolved.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error(`status_json_path escapes repo root: ${rel}`);
  }
  return resolved;
}

function matchesTrackedIdentity(activeAgent = {}, payload = {}, extra = {}) {
  const expectedRunId = normalizeIdentityValue(extra.runId ?? payload?.run_id);
  const expectedAttempt = normalizeIdentityValue(extra.attempt ?? payload?.attempt);
  const expectedDispatchId = normalizeIdentityValue(extra.dispatchId ?? payload?.dispatch_id ?? payload?.session?.label);
  const expectedSessionKey = normalizeIdentityValue(extra.sessionKey ?? null);

  const activeRunId = normalizeIdentityValue(activeAgent?.run_id);
  const activeAttempt = normalizeIdentityValue(activeAgent?.attempt);
  const activeDispatchId = normalizeIdentityValue(activeAgent?.dispatch_id ?? activeAgent?.label);
  const activeSessionKey = normalizeIdentityValue(activeAgent?.session_key);

  if (expectedRunId && activeRunId && activeRunId !== expectedRunId) return false;
  if (expectedAttempt && activeAttempt && activeAttempt !== expectedAttempt) return false;
  if (expectedDispatchId && activeDispatchId && activeDispatchId !== expectedDispatchId) return false;
  if (expectedSessionKey && activeSessionKey && activeSessionKey !== expectedSessionKey) return false;
  return true;
}

function updateTrackedStatusJson(statusJsonPath, mutate) {
  if (!statusJsonPath || !fs.existsSync(statusJsonPath)) return false;
  try {
    const status = JSON.parse(fs.readFileSync(statusJsonPath, 'utf8'));
    const next = mutate(status);
    if (!next) return false;
    writeJsonFileAtomic(statusJsonPath, next);
    return true;
  } catch (err) {
    console.warn(`[STATUS] Failed to update ${statusJsonPath}: ${err.message}`);
    return false;
  }
}

export function markBusterActiveAgent(statusJsonPath, payload, sessionData) {
  return updateTrackedStatusJson(statusJsonPath, (status) => {
    const previous = status.active_agent || {};
    setModuleActiveAgent(status, {
      session_key: sessionData.childSessionKey || previous.session_key || null,
      stream_log_path: sessionData.streamLogPath || previous.stream_log_path || null,
      label: payload?.dispatch_id || sessionData.label || previous.label || null,
      gateway_label: sessionData.label || previous.gateway_label || null,
      dispatch_id: payload?.dispatch_id || previous.dispatch_id || null,
      run_id: payload?.run_id || previous.run_id || null,
      attempt: payload?.attempt || previous.attempt || null,
      runtime: sessionData.runtime || payload?.session?.runtime || previous.runtime || null,
      model: payload?.session?.model || previous.model || null,
      agent_id: sessionData.agentId || payload?.session?.agentId || previous.agent_id || null,
      phase: 'buster',
      started_at: previous.started_at || new Date().toISOString(),
    });
    return status;
  });
}

export function clearBusterActiveAgent(statusJsonPath, payload, extra = {}) {
  return updateTrackedStatusJson(statusJsonPath, (status) => {
    const activeAgent = status.active_agent || null;
    if (!activeAgent) return null;
    if (!matchesTrackedIdentity(activeAgent, payload, extra)) return null;
    clearModuleActiveAgent(status);
    return status;
  });
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
 * Build a suite results embed (GO / NO-GO style with inline findings).
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
    { name: 'Status',  value: pass ? 'GO' : 'NO-GO', inline: true },
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
    title:     pass ? `✅ Suite Results: GO — ${moduleId}` : `🚫 Suite Results: NO-GO — ${moduleId}`,
    color:     pass ? 5763719 : 15158332,
    fields,
    footer:    EMBED_FOOTER,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build a session spawn embed (green, includes runtime type).
 */
export function buildSessionSpawnEmbed(moduleId, project, sessionData) {
  return {
    title:  `🚀 Session Spawned: ${moduleId}`,
    color:  5763719,
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

export async function doSandboxCleanup(stage, payload) {
  const scopedPayload = payload && (payload.run_id || payload.module_id || payload.gate_id || payload.dispatch_id)
    ? payload
    : null;
  return cleanupSandboxResources(stage, scopedPayload);
}
