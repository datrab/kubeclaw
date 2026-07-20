import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// services/status-store.ts — Lifecycle-backed module state plus gate files and logs

import fs from 'fs';
import path from 'path';

import { moduleLogDir, relPath, gateLogDir, ensureProjectLogDir, ensurePipelineRunLogDir, pipelineLogDir } from '../core/paths.ts';
import { log, initContextLogging } from '../core/logger.ts';
import { copyTranscriptArtifact, writePromptArtifact } from '../egress.ts';
import { emitPromptArtifactWriteWarning } from './system-io-warning.ts';
import { publishPromptEvidence } from './evidence-plane.ts';
import { buildLatestPointer } from './artifact-bundle.ts';
import {
  applyGateCompletion,
  applyModuleCompletion,
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
const GATE_ARCHIVE_DEFAULT_EXTENSION = '.json';

export {
  appendCooldownLifecycleEvent,
  appendLifecycleEvent,
  appendModuleLifecycleEvent,
  appendPipelineLifecycleEvent,
  appendStaleRecoveryLifecycleEvent,
  appendWaitLifecycleEvent,
  applyGateCompletion,
  applyModuleCompletion,
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

export function initLogDir(config, ctx, opts = {}) {
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

  if (opts.resume !== true && config?._resume !== true) {
    resetLifecycleStore(config);
  }
  initContextLogging(ctx, pipelineLogFd, runPipelineLogFd);
  log('INFO', `Log directory initialized: ${logDir}`);
}

function closeWriteStream(stream) {
  if (selectTruthyValue(() => (!stream), () => (typeof stream.end !== 'function'))) return Promise.resolve();
  if (selectTruthyValue(() => (stream.destroyed), () => (stream.closed))) return Promise.resolve();
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
  const modules = objectRecord(config?._progress?.modules);
  const direct = modules[dir] ? dir : null;
  if (direct) return direct;
  const match = Object.entries(modules).find(([, mod]) => mod?.dir === dir);
  if (match?.[0]) return match[0];
  const readModelMatch = Object.entries(objectRecord(loadLifecycleReadModels(config)?.modules))
    .find(([, entry]) => entry?.module_dir === dir);
  return selectDefinedValue(() => (readModelMatch?.[0]), () => (null));
}

export function loadStatus(config, dir, _opts = {}) {
  const moduleId = resolveModuleIdForDir(config, dir);
  if (!moduleId) return null;
  return projectModuleRuntimeState(config, moduleId, config?._progress?.modules?.[moduleId]);
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

function objectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function firstTextValue(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

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
  const previous = selectDefinedValue(() => (previousStatus), () => (INITIAL_GUARDED_STATUS_VALUES));
  const changes = [];
  for (const field of STATUS_LIFECYCLE_GUARDED_FIELDS) {
    const oldValue = previous[field] === undefined ? INITIAL_GUARDED_STATUS_VALUES[field] : previous[field];
    const newValue = nextStatus?.[field] === undefined ? INITIAL_GUARDED_STATUS_VALUES[field] : nextStatus[field];
    if (stableGuardValue(oldValue) !== stableGuardValue(newValue)) {
      changes.push({
        field,
        old_value: oldValue === undefined ? null : oldValue,
        new_value: newValue === undefined ? null : newValue,
      });
    }
  }
  return changes;
}

function normalizeLifecycleMutation(candidate) {
  if (!candidate) return null;
  if (candidate.lifecycleMutation) return candidate.lifecycleMutation;
  if (selectTruthyValue(() => (candidate.eventType), () => (candidate.lifecycleIntent))) return candidate;
  return null;
}

function assertLifecycleGuardAllowsSave(config, dir, status, lifecycleMutation) {
  if (lifecycleMutation) return;
  const moduleId = firstTextValue(status?.module_id, resolveModuleIdForDir(config, dir));
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
  const trackedAt = firstTextValue(activeAgent?.started_at);
  if (!trackedAt) return null;
  const identity = normalizeActiveSessionIdentity({
    run_id: firstTextValue(activeAgent?.run_id, config?._runId, config?.run_id),
    attempt: selectDefinedValue(() => (activeAgent?.attempt), () => (null)),
    dispatch_id: firstTextValue(activeAgent?.dispatch_id, status?.dispatch_id),
    session_key: selectTruthyValue(() => (activeAgent?.session_key), () => (null)),
    gateway_label: firstTextValue(activeAgent?.gateway_label, status?.gateway_label),
  });
  if (!hasStrongActiveSessionIdentity(identity)) return null;
  return {
    module_id: moduleId,
    run_id: identity.run_id,
    attempt: identity.attempt,
    dispatch_id: identity.dispatch_id,
    session_key: identity.session_key,
    gateway_label: identity.gateway_label,
    label: selectTruthyValue(() => (activeAgent?.label), () => (null)),
    runtime: selectTruthyValue(() => (activeAgent?.runtime), () => (null)),
    model: selectTruthyValue(() => (activeAgent?.model), () => (null)),
    stream_log_path: selectTruthyValue(() => (activeAgent?.stream_log_path), () => (null)),
    agent_id: selectTruthyValue(() => (activeAgent?.agent_id), () => (null)),
    phase: selectTruthyValue(() => (selectTruthyValue(() => (activeAgent?.phase), () => (status?.current_phase))), () => (null)),
    tracked_at: trackedAt,
    projection_source: READ_MODEL_SOURCE_CANONICAL_EVENTS,
  };
}

function syncRuntimeSnapshotToReadModels(config, dir, status) {
  const moduleId = firstTextValue(status?.module_id, resolveModuleIdForDir(config, dir));
  if (!moduleId) return;
  const readModels = loadLifecycleReadModels(config);
  const existing = selectTruthyValue(() => (readModels.modules?.[moduleId]), () => (null));
  if (!existing && status?.status !== 'PENDING') return;

  const nextStatus = selectDefinedValue(() => (firstTextValue(status?.status, existing?.status)), () => (INITIAL_GUARDED_STATUS_VALUES.status));
  const preservesRetryBridgeStatus = existing
    && ['FAIL', 'BLOCKED'].includes(existing.status)
    && nextStatus === 'READY_FOR_TESTING'
    && (selectTruthyValue(() => (status?.current_attempt == null), () => (Number(status.current_attempt) === Number(existing.current_attempt))));

  const hasActiveAgentField = Object.prototype.hasOwnProperty.call(objectRecord(status), 'active_agent');
  const activeAgent = selectTruthyValue(() => (status?.active_agent), () => (null));
  const projectedDispatchId = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (activeAgent?.dispatch_id), () => (status?.dispatch_id))), () => ((hasActiveAgentField ? null : existing?.dispatch_id)))), () => (null));
  const projectedSessionKey = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (activeAgent?.session_key), () => (status?.session_key))), () => ((hasActiveAgentField ? null : existing?.session_key)))), () => (null));
  const projectedGatewayLabel = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (activeAgent?.gateway_label), () => (status?.gateway_label))), () => ((hasActiveAgentField ? null : existing?.gateway_label)))), () => (null));

  readModels.modules[moduleId] = {
    ...objectRecord(existing),
    module_id: moduleId,
    title: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (status?.title), () => (existing?.title))), () => (config?._progress?.modules?.[moduleId]?.title))), () => (null)),
    module_dir: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (dir), () => (existing?.module_dir))), () => (config?._progress?.modules?.[moduleId]?.dir))), () => (null)),
    status: preservesRetryBridgeStatus ? existing.status : nextStatus,
    current_phase: selectDefinedValue(() => (selectDefinedValue(() => (status?.current_phase), () => (existing?.current_phase))), () => (null)),
    fail_count: selectDefinedValue(() => (selectDefinedValue(() => (status?.fail_count), () => (existing?.fail_count))), () => (INITIAL_GUARDED_STATUS_VALUES.fail_count)),
    fail_summaries: arrayValue(status?.fail_summaries).length > 0 ? arrayValue(status.fail_summaries) : arrayValue(existing?.fail_summaries),
    started_at: selectTruthyValue(() => (selectTruthyValue(() => (status?.started_at), () => (existing?.started_at))), () => (null)),
    attempt_started_at: selectTruthyValue(() => (selectTruthyValue(() => (status?.attempt_started_at), () => (existing?.attempt_started_at))), () => (null)),
    phase_started_at: selectTruthyValue(() => (selectTruthyValue(() => (status?.phase_started_at), () => (existing?.phase_started_at))), () => (null)),
    completed_at: selectTruthyValue(() => (selectTruthyValue(() => (status?.completed_at), () => (existing?.completed_at))), () => (null)),
    blocked_at: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (status?.blockedAt), () => (status?.blocked_at))), () => (existing?.blocked_at))), () => (null)),
    blocked_reason: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (status?.blockedReason), () => (status?.blocked_reason))), () => (existing?.blocked_reason))), () => (null)),
    blocked_phase: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (status?.blockedPhase), () => (status?.blocked_phase))), () => (existing?.blocked_phase))), () => (null)),
    blocked_fail_count: selectDefinedValue(() => (status?.blockedFailCount), () => (null)),
    current_attempt: status?.current_attempt != null && existing?.current_attempt != null
      ? Math.max(Number(status.current_attempt), Number(existing.current_attempt))
      : selectDefinedValue(() => (status?.current_attempt), () => (null)),
    dispatch_id: projectedDispatchId,
    session_key: projectedSessionKey,
    gateway_label: projectedGatewayLabel,
    validation: selectTruthyValue(() => (selectTruthyValue(() => (status?.validation), () => (existing?.validation))), () => (null)),
    cost: selectTruthyValue(() => (selectTruthyValue(() => (existing?.cost), () => (status?.cost))), () => (null)),
    projection_source: firstTextValue(existing?.projection_source, READ_MODEL_SOURCE_CANONICAL_EVENTS),
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
  const logDir = moduleLogDir(config, dir);
  if (!logDir) {
    throw new Error('savePrompt requires canonical module log directory');
  }
  if (typeof prompt !== 'string') {
    log('DEBUG', 'Prompt save skipped (non-critical): missing log dir, module dir, or prompt content');
    return;
  }
  let filePath = path.join(logDir, `${agentType}-prompt-attempt-${attempt}.md`);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writePromptArtifact(filePath, prompt, { agent_type: agentType, attempt, module_dir: dir });
    const moduleId = resolveModuleIdForDir(config, dir);
    publishPromptEvidence(config, { prompt, agent_type: agentType, work_id: moduleId, attempt });
    log('DEBUG', `Prompt artifact saved: ${relPath(config, filePath)} (${prompt.length} chars)`);
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
    copyTranscriptArtifact(streamLogPath, destPath);
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
  const archivedPath = path.join(archiveDir, `${parsed.name}${labelSuffix}${attemptSuffix}-${ts}${selectTruthyValue(() => (parsed.ext), () => (GATE_ARCHIVE_DEFAULT_EXTENSION))}`);
  fs.copyFileSync(sourcePath, archivedPath);
  return archivedPath;
}
