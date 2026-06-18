// services/status-store.ts — Lifecycle-backed module state plus gate files and logs

import fs from 'fs';
import path from 'path';

import { moduleLogDir, relPath, gateLogDir, ensureProjectLogDir, ensurePipelineRunLogDir, pipelineLogDir } from '../core/paths.ts';
import { log, initContextLogging } from '../core/logger.ts';
import { copyRedactedTranscriptArtifact, writeRedactedPromptArtifact } from '../redaction.ts';
import { emitPromptArtifactWriteWarning } from './system-io-warning.ts';
import { buildLatestPointer } from './artifact-bundle.ts';
import {
  appendModuleLifecycleEvent,
  getLifecycleModuleState,
  loadLifecycleReadModels,
  resetLifecycleStore,
  saveLifecycleReadModels,
} from './status-store-lifecycle.ts';
import {
  READ_MODEL_SOURCE_CANONICAL_EVENTS,
  projectModuleRuntimeState,
} from './status-store-read-models.ts';
import {
  hasStrongActiveSessionIdentity,
  normalizeActiveSessionIdentity,
} from './session-authority.ts';

export {
  appendCooldownLifecycleEvent,
  appendLifecycleEvent,
  appendModuleLifecycleEvent,
  appendPipelineLifecycleEvent,
  appendStaleRecoveryLifecycleEvent,
  appendWaitLifecycleEvent,
  getLifecycleCooldown,
  getLifecycleGateState,
  getLifecycleModuleState,
  loadLifecycleReadModels,
  readLifecycleEvents,
  rebuildLifecycleReadModels,
  saveLifecycleReadModels,
} from './status-store-lifecycle.ts';

export {
  GATE_STATUS_AUTHORITY_ROLES,
  buildGateStatusAuthorityPolicy,
  gateOutputExists,
  getAuthoritativeModuleState,
  projectGateEvidenceIntoReadModel,
  projectGateCompletionState,
  projectGateSchedulerState,
  projectModuleSchedulerState,
  readBusterGateCompletion,
  readGateCompletionEvidence,
  readGateOutput,
  syncApprovalWaitState,
} from './status-store-read-models.ts';

export {
  projectModuleTruthDrift,
  projectGateTruthDrift,
} from './truth-drift.ts';

// ---------------------------------------------------------------------------
// Log directory init
// ---------------------------------------------------------------------------

export function initLogDir(config, ctx) {
  const logDir = ensureProjectLogDir(config);
  const pipelineDir = pipelineLogDir(config);
  fs.mkdirSync(pipelineDir, { recursive: true });
  fs.mkdirSync(path.join(logDir, 'modules'), { recursive: true });
  fs.mkdirSync(path.join(logDir, 'gates'), { recursive: true });
  const runLogDir = ensurePipelineRunLogDir(config);
  if (ctx && typeof ctx.setLogDirs === 'function') {
    ctx.setLogDirs({ logDir, runLogDir });
  } else if (ctx) {
    ctx.logDir = logDir;
    ctx.runLogDir = runLogDir;
  }

  const pipelineLogFd = fs.createWriteStream(path.join(pipelineDir, 'pipeline.jsonl'), { flags: 'a' });
  const runPipelineLogFd = fs.createWriteStream(path.join(runLogDir, 'pipeline.jsonl'), { flags: 'a' });
  config._pipelineLogFd = pipelineLogFd;
  config._runPipelineLogFd = runPipelineLogFd;
  if (ctx && typeof ctx.setPipelineLogStreams === 'function') {
    ctx.setPipelineLogStreams({ pipelineLogFd, runPipelineLogFd });
  }

  fs.writeFileSync(
    path.join(pipelineDir, 'latest.json'),
    JSON.stringify(buildLatestPointer(config, {
      status: 'running',
      startedAt: new Date().toISOString(),
      completedAt: null,
      terminalStatus: null,
    }), null, 2)
  );

  resetLifecycleStore(config);
  initContextLogging(ctx, pipelineLogFd, runPipelineLogFd);
  log('INFO', `Log directory initialized: ${logDir}`);
}

function closeWriteStream(stream) {
  if (!stream || typeof stream.end !== 'function') return Promise.resolve();
  if (stream.destroyed || stream.closed) return Promise.resolve();
  return new Promise((resolve) => {
    stream.end(resolve);
  });
}

export async function closeLogDir(config, ctx = null) {
  const streams = [
    config?._pipelineLogFd,
    config?._runPipelineLogFd,
    ctx?._pipelineLogFd,
    ctx?._runPipelineLogFd,
  ].filter(Boolean);
  for (const stream of [...new Set(streams)]) {
    await closeWriteStream(stream);
  }
  if (config) {
    config._pipelineLogFd = null;
    config._runPipelineLogFd = null;
  }
  if (ctx) {
    ctx._pipelineLogFd = null;
    ctx._runPipelineLogFd = null;
  }
}

// ---------------------------------------------------------------------------
// Status operations
// ---------------------------------------------------------------------------

function resolveModuleIdForDir(config, dir) {
  if (!dir) return null;
  const modules = config?._progress?.modules || {};
  const direct = modules[dir] ? dir : null;
  if (direct) return direct;
  const match = Object.entries(modules).find(([, mod]) => mod?.dir === dir);
  if (match?.[0]) return match[0];
  const readModelMatch = Object.entries(loadLifecycleReadModels(config)?.modules || {})
    .find(([, entry]) => entry?.module_dir === dir);
  return readModelMatch?.[0] || dir;
}

export function loadStatus(config, dir, _opts = {}) {
  const moduleId = resolveModuleIdForDir(config, dir);
  return projectModuleRuntimeState(config, moduleId, config?._progress?.modules?.[moduleId] || { dir });
}

export const STATUS_LIFECYCLE_GUARDED_FIELDS = Object.freeze([
  'status',
  'current_phase',
  'fail_count',
  'fail_summaries',
  'completed_at',
  'blockedAt',
  'blockedReason',
  'blockedPhase',
  'attempt_started_at',
  'phase_started_at',
]);

const INITIAL_GUARDED_STATUS_VALUES = Object.freeze({
  status: 'PENDING',
  current_phase: null,
  fail_count: 0,
  fail_summaries: [],
  completed_at: null,
  blockedAt: null,
  blockedReason: null,
  blockedPhase: null,
  attempt_started_at: null,
  phase_started_at: null,
});

function stableGuardValue(value) {
  if (value === undefined) return null;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function lifecycleModuleToGuardStatus(lifecycleModule) {
  if (!lifecycleModule) return null;
  return {
    status: lifecycleModule.status,
    current_phase: lifecycleModule.current_phase,
    fail_count: lifecycleModule.fail_count,
    fail_summaries: lifecycleModule.fail_summaries,
    completed_at: lifecycleModule.completed_at,
    blockedAt: lifecycleModule.blocked_at,
    blockedReason: lifecycleModule.blocked_reason,
    blockedPhase: lifecycleModule.blocked_phase,
    attempt_started_at: lifecycleModule.attempt_started_at,
    phase_started_at: lifecycleModule.phase_started_at,
  };
}

export function getUnguardedLifecycleFieldChanges(previousStatus, nextStatus) {
  const previous = previousStatus || INITIAL_GUARDED_STATUS_VALUES;
  const changes = [];
  for (const field of STATUS_LIFECYCLE_GUARDED_FIELDS) {
    const oldValue = previous[field] === undefined ? INITIAL_GUARDED_STATUS_VALUES[field] : previous[field];
    const newValue = nextStatus?.[field] === undefined ? INITIAL_GUARDED_STATUS_VALUES[field] : nextStatus[field];
    if (stableGuardValue(oldValue) !== stableGuardValue(newValue)) {
      changes.push({ field, old_value: oldValue ?? null, new_value: newValue ?? null });
    }
  }
  return changes;
}

function normalizeLifecycleMutation(candidate) {
  if (!candidate) return null;
  if (candidate.lifecycleMutation) return candidate.lifecycleMutation;
  if (candidate.eventType || candidate.lifecycleIntent) return candidate;
  return null;
}

function assertLifecycleGuardAllowsSave(config, dir, status, lifecycleMutation) {
  if (lifecycleMutation) return;
  const moduleId = status?.module_id || resolveModuleIdForDir(config, dir);
  const previousStatus = lifecycleModuleToGuardStatus(getLifecycleModuleState(config, moduleId));
  const changes = getUnguardedLifecycleFieldChanges(previousStatus, status).filter((entry) => {
    if (entry.field === 'status'
      && ['FAIL', 'BLOCKED'].includes(previousStatus?.status)
      && status?.status === 'READY_FOR_TESTING') {
      return false;
    }
    return true;
  });
  if (changes.length === 0) return;

  const fields = changes.map((entry) => entry.field).join(', ');
  const err = new Error(`Illegal status save: guarded lifecycle fields changed without lifecycle transition (${fields})`);
  err.code = 'STATUS_LIFECYCLE_GUARD_VIOLATION';
  err.guarded_fields = changes.map((entry) => entry.field);
  err.changes = changes;
  throw err;
}

function buildStrongModuleActiveSessionProjection(config, moduleId, status, activeAgent) {
  if (!activeAgent?.session_key) return null;
  const identity = normalizeActiveSessionIdentity({
    run_id: activeAgent?.run_id || config?._runId || config?.run_id || null,
    attempt: activeAgent?.attempt ?? status?.current_attempt ?? null,
    dispatch_id: activeAgent?.dispatch_id || status?.dispatch_id || null,
    session_key: activeAgent?.session_key || null,
    gateway_label: activeAgent?.gateway_label || status?.gateway_label || null,
  });
  if (!hasStrongActiveSessionIdentity(identity)) return null;
  return {
    module_id: moduleId,
    run_id: identity.run_id,
    attempt: identity.attempt,
    dispatch_id: identity.dispatch_id,
    session_key: identity.session_key,
    gateway_label: identity.gateway_label,
    label: activeAgent?.label || null,
    runtime: activeAgent?.runtime || null,
    model: activeAgent?.model || null,
    stream_log_path: activeAgent?.stream_log_path || null,
    agent_id: activeAgent?.agent_id || null,
    phase: activeAgent?.phase || status?.current_phase || null,
    tracked_at: activeAgent?.started_at || new Date().toISOString(),
    projection_source: READ_MODEL_SOURCE_CANONICAL_EVENTS,
  };
}

function syncRuntimeSnapshotToReadModels(config, dir, status) {
  const moduleId = status?.module_id || resolveModuleIdForDir(config, dir);
  if (!moduleId) return;
  const readModels = loadLifecycleReadModels(config);
  const existing = readModels.modules?.[moduleId] || null;
  if (!existing && status?.status !== 'PENDING') return;

  const nextStatus = status?.status || existing?.status || 'PENDING';
  const preservesRetryBridgeStatus = existing
    && ['FAIL', 'BLOCKED'].includes(existing.status)
    && nextStatus === 'READY_FOR_TESTING'
    && (status?.current_attempt == null || Number(status.current_attempt) === Number(existing.current_attempt));

  const hasActiveAgentField = Object.prototype.hasOwnProperty.call(status || {}, 'active_agent');
  const activeAgent = status?.active_agent || null;
  const projectedDispatchId = activeAgent?.dispatch_id || status?.dispatch_id || (hasActiveAgentField ? null : existing?.dispatch_id) || null;
  const projectedSessionKey = activeAgent?.session_key || status?.session_key || (hasActiveAgentField ? null : existing?.session_key) || null;
  const projectedGatewayLabel = activeAgent?.gateway_label || status?.gateway_label || (hasActiveAgentField ? null : existing?.gateway_label) || null;

  readModels.modules[moduleId] = {
    ...(existing || {}),
    module_id: moduleId,
    title: status?.title || existing?.title || config?._progress?.modules?.[moduleId]?.title || null,
    module_dir: dir || existing?.module_dir || config?._progress?.modules?.[moduleId]?.dir || null,
    status: preservesRetryBridgeStatus ? existing.status : nextStatus,
    current_phase: status?.current_phase ?? existing?.current_phase ?? null,
    fail_count: status?.fail_count ?? existing?.fail_count ?? 0,
    fail_summaries: status?.fail_summaries || existing?.fail_summaries || [],
    started_at: status?.started_at || existing?.started_at || null,
    attempt_started_at: status?.attempt_started_at || existing?.attempt_started_at || null,
    phase_started_at: status?.phase_started_at || existing?.phase_started_at || null,
    completed_at: status?.completed_at || existing?.completed_at || null,
    blocked_at: status?.blockedAt || status?.blocked_at || existing?.blocked_at || null,
    blocked_reason: status?.blockedReason || status?.blocked_reason || existing?.blocked_reason || null,
    blocked_phase: status?.blockedPhase || status?.blocked_phase || existing?.blocked_phase || null,
    blocked_fail_count: status?.blockedFailCount ?? status?.blocked_fail_count ?? existing?.blocked_fail_count ?? null,
    current_attempt: status?.current_attempt != null && existing?.current_attempt != null
      ? Math.max(Number(status.current_attempt), Number(existing.current_attempt))
      : status?.current_attempt ?? activeAgent?.attempt ?? existing?.current_attempt ?? null,
    dispatch_id: projectedDispatchId,
    session_key: projectedSessionKey,
    gateway_label: projectedGatewayLabel,
    validation: status?.validation || existing?.validation || null,
    cost: existing?.cost || status?.cost || null,
    projection_source: existing?.projection_source || READ_MODEL_SOURCE_CANONICAL_EVENTS,
  };

  const activeSessionProjection = buildStrongModuleActiveSessionProjection(config, moduleId, status, activeAgent);
  if (activeSessionProjection) {
    readModels.active_sessions.modules[moduleId] = activeSessionProjection;
  } else {
    delete readModels.active_sessions.modules[moduleId];
  }

  saveLifecycleReadModels(config, readModels);
}

export function saveStatus(config, dir, status, lifecycleTransition = null) {
  status.updated_at = new Date().toISOString();

  const lifecycleMutation = normalizeLifecycleMutation(lifecycleTransition);
  assertLifecycleGuardAllowsSave(config, dir, status, lifecycleMutation);
  if (lifecycleMutation?.eventType) {
    appendModuleLifecycleEvent(config, dir, status, lifecycleMutation);
  }
  syncRuntimeSnapshotToReadModels(config, dir, status);
}

export function initStatus(moduleId, moduleConfig) {
  return {
    module_id: moduleId,
    title: moduleConfig.title,
    status: 'PENDING',
    current_phase: null,
    fail_count: 0,
    fail_summaries: [],
    history: [],
    started_at: null,
    attempt_started_at: null,
    phase_started_at: null,
    completed_at: null,
    cost: {
      total_duration_seconds: 0,
      attempt_duration_seconds: 0,
    },
    validation: {
      attempt: 1,
      delivery_lint_passed: false,
      delivery_lint_passed_at: null,
      pre_check_passed: false,
      pre_check_passed_at: null,
    },
    forge_commit: null,
    buster_commit: null,
  };
}

// ---------------------------------------------------------------------------
// Prompt / transcript persistence
// ---------------------------------------------------------------------------

export function savePrompt(config, dir, agentType, attempt, prompt) {
  const logDir = moduleLogDir(config, dir); if (!logDir || typeof prompt !== 'string') {
    log('DEBUG', 'Prompt save skipped (non-critical): missing log dir, module dir, or prompt content');
    return;
  }
  let filePath = path.join(logDir, `${agentType}-prompt-attempt-${attempt}.md`);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeRedactedPromptArtifact(filePath, prompt, { agent_type: agentType, attempt, module_dir: dir });
    log('DEBUG', `Prompt metadata saved: ${relPath(config, filePath)} (${prompt.length} chars redacted)`);
  } catch (e) {
    log('DEBUG', `Prompt save failed (non-critical): ${e.message}`);
    let moduleId = dir;
    try { moduleId = resolveModuleIdForDir(config, dir); } catch (_resolveError) { moduleId = dir; }
    emitPromptArtifactWriteWarning(config, filePath, e, {
      module_id: moduleId,
      attempt,
    });
  }
}

export function saveStreamLog(config, dir, agentType, attempt, streamLogPath) {
  if (!streamLogPath) return;
  try {
    if (!fs.existsSync(streamLogPath)) {
      log('DEBUG', `Stream log not found: ${streamLogPath}`);
      return;
    }
    const logDir = moduleLogDir(config, dir);
    fs.mkdirSync(logDir, { recursive: true });
    const destPath = path.join(logDir, `${agentType}-transcript-attempt-${attempt}.jsonl`);
    copyRedactedTranscriptArtifact(streamLogPath, destPath);
    const size = fs.statSync(destPath).size;
    log('OK', `Stream log metadata saved: ${relPath(config, destPath)} (${(size / 1024).toFixed(1)} KB)`);
  } catch (e) {
    log('DEBUG', `Stream log save failed (non-critical): ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Archive helpers
// ---------------------------------------------------------------------------

export function gateArchiveDir(config, gateId) {
  return path.join(gateLogDir(config, gateId), 'archive');
}

export function archiveGateOutputIfPresent(config, gateId, sourcePath, { attempt = null, label = null } = {}) {
  if (!fs.existsSync(sourcePath)) return null;

  const archiveDir = gateArchiveDir(config, gateId);
  fs.mkdirSync(archiveDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const parsed = path.parse(sourcePath);
  const attemptSuffix = attempt ? `-attempt-${attempt}` : '';
  const labelSuffix = label ? `-${label}` : '';
  const archivedPath = path.join(archiveDir, `${parsed.name}${labelSuffix}${attemptSuffix}-${ts}${parsed.ext || '.json'}`);
  fs.copyFileSync(sourcePath, archivedPath);
  return archivedPath;
}
