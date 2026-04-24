// services/status-store-lifecycle.js — canonical lifecycle event log + read models

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

import { pipelineRunLogDir } from '../core/paths.js';
import { getActiveContext } from '../core/logger.js';
import { getRunId, createOpaqueId } from '../core/runtime.js';
import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
} from './correlation.js';
import { normalizeFailureClass } from './failure-semantics.js';

const LIFECYCLE_READ_MODELS_VERSION = 'v1';
const APPROVAL_SIGNAL_KINDS = new Set([
  'approve',
  'reject',
  'cancel',
  'timeout_continue',
  'timeout_block',
]);
const LEGACY_MODULE_STATUS_BOOTSTRAP_MODE = 'migration_only';

export function isLegacyModuleStatusBootstrapEnabled(config) {
  return String(config?.compatibility?.legacy_module_status_bootstrap_mode || '').trim().toLowerCase() === LEGACY_MODULE_STATUS_BOOTSTRAP_MODE;
}

function ensureRunLogDir(config) {
  if (config?._runLogDir) return config._runLogDir;
  if (!config?._logDir) return null;
  const runLogDir = pipelineRunLogDir(config);
  fs.mkdirSync(runLogDir, { recursive: true });
  config._runLogDir = runLogDir;
  return runLogDir;
}

function lifecycleDir(config) {
  const runLogDir = ensureRunLogDir(config);
  if (!runLogDir) return null;
  const dir = path.join(runLogDir, 'lifecycle');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function lifecycleEventsPath(config) {
  const dir = lifecycleDir(config);
  return dir ? path.join(dir, 'canonical-events.jsonl') : null;
}

function lifecycleReadModelsPath(config) {
  const dir = lifecycleDir(config);
  return dir ? path.join(dir, 'read-models.json') : null;
}

function readJsonIfPresent(filePath, fallback = null) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonAtomic(filePath, value) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, filePath);
}

function appendJsonLine(filePath, value) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(value) + '\n');
}

function readJsonLines(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function stableStringify(value) {
  if (value === null || value === undefined) return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashValue(value) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, 12);
}

function slugify(value, fallback = 'unknown') {
  const normalized = String(value || fallback).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

export function cloneSerializable(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

export function getActiveProgress(config) {
  return getActiveContext()?.progress || config?._progress || null;
}

export function resolveModuleConfig(progress, moduleId, dir) {
  if (!progress?.modules) return null;
  if (moduleId && progress.modules[moduleId]) return progress.modules[moduleId];
  return Object.values(progress.modules).find((mod) => mod?.dir === dir) || null;
}

function resolveModuleAttempt(status, mutation = {}, currentModuleState = null) {
  if (mutation?.attempt != null) return mutation.attempt;
  if (status?.active_agent?.attempt != null) return Number(status.active_agent.attempt);
  const failCount = Number(status?.fail_count || 0);
  const heuristicAttempt = (mutation?.newStatus === 'FAIL' || mutation?.newStatus === 'BLOCKED')
    ? Math.max(1, failCount || 1)
    : Math.max(1, failCount + 1);
  const currentAttempt = Number(currentModuleState?.current_attempt || 0);

  if (currentAttempt > heuristicAttempt) return currentAttempt;
  return heuristicAttempt;
}

function resolveModuleCommit(status) {
  return status?.commit_hash
    || status?.forge_commit_hash
    || status?.buster_commit_hash
    || status?.forge_commit
    || status?.buster_commit
    || null;
}

function buildPipelineRefs(config) {
  const runId = config?._runId || config?.run_id || getRunId(config) || null;
  const runRef = runId ? `run:${runId}` : null;
  return {
    primary_ref: { kind: 'pipeline_run', id: runRef },
    run_id: runId,
    run_ref: runRef,
  };
}

export function buildModuleAttemptRefs(config, status, dir, mutation = {}, currentModuleState = null) {
  const moduleId = status?.module_id || dir;
  const attempt = resolveModuleAttempt(status, mutation, currentModuleState);
  const runId = config?._runId || config?.run_id || getRunId(config) || null;
  const runRef = runId ? `run:${runId}` : null;
  const moduleRef = moduleId ? `module:${moduleId}` : null;
  const moduleAttemptRef = runId && moduleId && attempt ? `module_attempt:${runId}:${moduleId}:${attempt}` : null;
  return {
    primary_ref: { kind: 'module_attempt', id: moduleAttemptRef },
    run_id: runId,
    run_ref: runRef,
    module_id: moduleId,
    module_ref: moduleRef,
    attempt,
    module_attempt_ref: moduleAttemptRef,
    dispatch_id: resolveStatusDispatchId(status),
    gateway_label: resolveStatusGatewayLabel(status),
    session_key: resolveStatusSessionKey(status),
  };
}

export function buildGateEvaluationRefs(config, {
  gateId,
  gateType = 'approval',
  attempt = 1,
} = {}) {
  const runId = config?._runId || config?.run_id || getRunId(config) || null;
  const runRef = runId ? `run:${runId}` : null;
  const gateRef = gateId ? `gate:${gateId}` : null;
  const gateEvaluationRef = runId && gateId
    ? `gate_evaluation:${runId}:${gateId}:${attempt || 1}`
    : null;

  return {
    primary_ref: { kind: 'gate_evaluation', id: gateEvaluationRef },
    run_id: runId,
    run_ref: runRef,
    gate_id: gateId || null,
    gate_ref: gateRef,
    gate_type: gateType || null,
    attempt: attempt || 1,
    gate_evaluation_ref: gateEvaluationRef,
  };
}

function buildWaitRefs(config, {
  gateId,
  gateType = 'approval',
  attempt = 1,
  waitKind = 'approval',
} = {}) {
  const gateRefs = buildGateEvaluationRefs(config, { gateId, gateType, attempt });
  const waitRef = gateRefs.run_id && gateId
    ? `wait:${gateRefs.run_id}:gate:${gateId}:${waitKind}`
    : null;
  return {
    ...gateRefs,
    primary_ref: { kind: 'wait', id: waitRef },
    wait_ref: waitRef,
  };
}

export function buildResumeSignalRefs(config, {
  gateId,
  gateType = 'approval',
  attempt = 1,
  waitKind = 'approval',
  signalKind,
} = {}) {
  const waitRefs = buildWaitRefs(config, { gateId, gateType, attempt, waitKind });
  const resumeSignalRef = waitRefs.run_id && gateId && signalKind
    ? `resume_signal:${waitRefs.run_id}:gate:${gateId}:${waitKind}:${signalKind}`
    : null;
  return {
    ...waitRefs,
    primary_ref: { kind: 'resume_signal', id: resumeSignalRef },
    signal_kind: signalKind || null,
    resume_signal_ref: resumeSignalRef,
  };
}

function buildCooldownRefs(config, {
  moduleId = null,
  gateId = null,
  gateType = null,
  attempt = null,
} = {}) {
  if (moduleId) {
    const runId = config?._runId || config?.run_id || getRunId(config) || null;
    const resolvedAttempt = Number(attempt || 1);
    const runRef = runId ? `run:${runId}` : null;
    const moduleRef = `module:${moduleId}`;
    const moduleAttemptRef = runId ? `module_attempt:${runId}:${moduleId}:${resolvedAttempt}` : null;
    return {
      primary_ref: { kind: 'module_attempt', id: moduleAttemptRef },
      run_id: runId,
      run_ref: runRef,
      module_id: moduleId,
      module_ref: moduleRef,
      attempt: resolvedAttempt,
      module_attempt_ref: moduleAttemptRef,
    };
  }

  if (gateId) {
    return buildGateEvaluationRefs(config, {
      gateId,
      gateType: gateType || null,
      attempt: Number(attempt || 1),
    });
  }

  throw new Error('buildCooldownRefs requires moduleId or gateId');
}

function deriveApprovalResolutionFromSignal(signalKind, continued = null) {
  switch (String(signalKind || '').trim().toLowerCase()) {
    case 'approve':
      return { status: 'APPROVED', scheduler_consumed: true, close_reason: 'signaled', continued: false };
    case 'reject':
      return { status: 'REJECTED', scheduler_consumed: false, close_reason: 'signaled', continued: false };
    case 'cancel':
      return { status: 'CANCELLED', scheduler_consumed: false, close_reason: 'cancelled', continued: false };
    case 'timeout_continue':
      return { status: 'TIMED_OUT', scheduler_consumed: true, close_reason: 'timed_out', continued: true };
    case 'timeout_block':
      return { status: 'TIMED_OUT', scheduler_consumed: false, close_reason: 'timed_out', continued: false };
    default:
      return {
        status: null,
        scheduler_consumed: false,
        close_reason: null,
        continued: continued == null ? null : Boolean(continued),
      };
  }
}

export function deriveApprovalResolutionFromState(state = {}) {
  const status = String(state?.status || '').trim().toUpperCase();
  switch (status) {
    case 'APPROVED':
      return { signalKind: 'approve', resolutionKind: 'approved', closeReason: 'signaled' };
    case 'REJECTED':
      return { signalKind: 'reject', resolutionKind: 'rejected', closeReason: 'signaled' };
    case 'CANCELLED':
      return { signalKind: 'cancel', resolutionKind: 'cancelled', closeReason: 'cancelled' };
    case 'TIMED_OUT': {
      const timeoutSignal = state?.continued === true ? 'timeout_continue' : 'timeout_block';
      return { signalKind: timeoutSignal, resolutionKind: 'timed_out', closeReason: 'timed_out' };
    }
    default:
      return { signalKind: null, resolutionKind: null, closeReason: null };
  }
}

function normalizeLifecycleTerminalStatus(value) {
  const text = String(value || '').trim().toUpperCase();
  return text || null;
}

function buildLifecycleIdempotencyKey(type, refs, data = {}) {
  const primaryRef = refs?.primary_ref?.id || refs?.module_attempt_ref || refs?.run_ref || 'unknown';
  switch (type) {
    case 'pipeline_run.started':
      return `${type}|${refs.run_ref}|mode:${slugify(data.run_mode || 'full')}`;
    case 'pipeline_run.completed':
      return `${type}|${refs.run_ref}|final:completed`;
    case 'pipeline_run.halted':
      return `${type}|${refs.run_ref}|reason:${slugify(data.halt_reason || 'unknown')}`;
    case 'module_attempt.started':
      return `${type}|${refs.module_attempt_ref}|phase:start`;
    case 'module_attempt.ready_for_testing':
      return `${type}|${refs.module_attempt_ref}|phase:ready_for_testing`;
    case 'module_attempt.testing_started':
      return `${type}|${refs.module_attempt_ref}|phase:testing_started`;
    case 'module_attempt.failed': {
      const fingerprint = hashValue(stableStringify({
        reason: data.reason || null,
        summary: data.summary || null,
        validator_name: data.validator_name || null,
        suite_names: data.suite_names || [],
      }));
      return `${type}|${refs.module_attempt_ref}|failure:${slugify(data.failure_class || 'unknown')}:${fingerprint}`;
    }
    case 'module_attempt.passed':
      return `${type}|${refs.module_attempt_ref}|final:passed`;
    case 'module_attempt.blocked':
      return `${type}|${refs.module_attempt_ref}|reason:${slugify(data.reason || 'blocked')}`;
    case 'wait.opened':
      return `${type}|${refs.wait_ref}|state:open`;
    case 'wait.closed':
      return `${type}|${refs.wait_ref}|reason:${slugify(data.close_reason || 'closed')}`;
    case 'resume_signal.received':
      return `${type}|${refs.resume_signal_ref}|signal:${slugify(data.signal_kind || refs.signal_kind || 'unknown')}`;
    case 'rate_limit.cooldown_started':
      return `${type}|${primaryRef}|cooldown:${Number(data.pause_count || 0)}`;
    case 'rate_limit.cooldown_completed':
      return `${type}|${primaryRef}|cooldown:${Number(data.pause_count || 0)}:completed`;
    default:
      return `${type}|${primaryRef}|hash:${hashValue(stableStringify(data))}`;
  }
}

function createDefaultLifecycleReadModels(config) {
  return {
    schemaVersion: LIFECYCLE_READ_MODELS_VERSION,
    run_id: config?._runId || config?.run_id || getRunId(config) || null,
    generated_at: new Date().toISOString(),
    last_event_id: null,
    last_event_type: null,
    event_count: 0,
    pipeline: null,
    progression: {
      modules_total: 0,
      modules_passed: 0,
      modules_failed: 0,
      modules_blocked: 0,
      modules_active: 0,
    },
    modules: {},
    gates: {},
    waits: {
      by_ref: {},
    },
    signals: {
      by_ref: {},
    },
    active_sessions: {
      modules: {},
      gates: {},
    },
    cooldowns: {
      modules: {},
      gates: {},
    },
  };
}

export function loadLifecycleReadModels(config) {
  const filePath = lifecycleReadModelsPath(config);
  if (!filePath) {
    if (!config?._lifecycleReadModelsCache) {
      config._lifecycleReadModelsCache = createDefaultLifecycleReadModels(config);
    }
    return cloneSerializable(config._lifecycleReadModelsCache);
  }
  return readJsonIfPresent(filePath, createDefaultLifecycleReadModels(config));
}

export function saveLifecycleReadModels(config, readModels) {
  const filePath = lifecycleReadModelsPath(config);
  const next = {
    ...readModels,
    generated_at: new Date().toISOString(),
  };
  config._lifecycleReadModelsCache = cloneSerializable(next);
  writeJsonAtomic(filePath, next);
  return next;
}

export function readLifecycleEvents(config) {
  const filePath = lifecycleEventsPath(config);
  if (!filePath) return cloneSerializable(config?._lifecycleEventsCache || []);
  return readJsonLines(filePath);
}

export function recomputeProgression(readModels) {
  const moduleEntries = Object.values(readModels.modules || {});
  readModels.progression = {
    modules_total: moduleEntries.length,
    modules_passed: moduleEntries.filter((entry) => entry.status === 'PASS').length,
    modules_failed: moduleEntries.filter((entry) => entry.status === 'FAIL').length,
    modules_blocked: moduleEntries.filter((entry) => entry.status === 'BLOCKED').length,
    modules_active: moduleEntries.filter((entry) => ['IN_PROGRESS', 'READY_FOR_TESTING', 'TESTING', 'RATE_LIMITED'].includes(entry.status)).length,
  };
  return readModels.progression;
}

function ensureGateReadModel(next, refs = {}) {
  const gateId = refs?.gate_id;
  if (!gateId) return null;
  const existing = next.gates[gateId] || { gate_id: gateId };
  const nextGate = {
    ...existing,
    gate_id: gateId,
    gate_type: refs?.gate_type || existing.gate_type || null,
    gate_ref: refs?.gate_ref || existing.gate_ref || null,
    gate_evaluation_ref: refs?.gate_evaluation_ref || existing.gate_evaluation_ref || null,
    attempt: refs?.attempt ?? existing.attempt ?? 1,
  };
  next.gates[gateId] = nextGate;
  return nextGate;
}

function applyWaitEventToReadModels(next, event) {
  const gateEntry = ensureGateReadModel(next, event.refs);
  const waitRef = event.refs?.wait_ref;
  if (!waitRef) return;

  const currentWait = next.waits?.by_ref?.[waitRef] || {};
  const waitEntry = {
    ...currentWait,
    wait_ref: waitRef,
    scope: event.refs?.gate_id ? 'gate' : (event.refs?.module_id ? 'module' : 'pipeline'),
    run_id: event.refs?.run_id || currentWait.run_id || null,
    gate_id: event.refs?.gate_id || currentWait.gate_id || null,
    gate_type: event.refs?.gate_type || currentWait.gate_type || null,
    gate_evaluation_ref: event.refs?.gate_evaluation_ref || currentWait.gate_evaluation_ref || null,
    module_id: event.refs?.module_id || currentWait.module_id || null,
    attempt: event.refs?.attempt ?? currentWait.attempt ?? 1,
    wait_kind: event.data?.wait_kind || currentWait.wait_kind || null,
    requested_at: event.data?.requested_at || currentWait.requested_at || event.occurred_at,
    deadline: event.data?.deadline || currentWait.deadline || null,
    timeout_minutes: event.data?.timeout_minutes ?? currentWait.timeout_minutes ?? null,
    timeout_policy: event.data?.timeout_policy || currentWait.timeout_policy || null,
    gate_title: event.data?.gate_title || currentWait.gate_title || null,
    request_message_ref: event.data?.request_message_ref ?? currentWait.request_message_ref ?? null,
    request_artifact_path: event.data?.request_artifact_path ?? currentWait.request_artifact_path ?? null,
    state: event.type === 'wait.closed' ? 'CLOSED' : 'OPEN',
    opened_at: currentWait.opened_at || event.occurred_at,
    closed_at: event.type === 'wait.closed' ? event.data?.closed_at || event.occurred_at : currentWait.closed_at || null,
    close_reason: event.type === 'wait.closed' ? event.data?.close_reason || null : currentWait.close_reason || null,
    resolution_kind: event.type === 'wait.closed' ? event.data?.resolution_kind || null : currentWait.resolution_kind || null,
    decision_by: event.type === 'wait.closed' ? event.data?.decision_by || null : currentWait.decision_by || null,
    decision_via: event.type === 'wait.closed' ? event.data?.decision_via || null : currentWait.decision_via || null,
    resume_signal_ref: event.type === 'wait.closed' ? event.data?.resume_signal_ref || null : currentWait.resume_signal_ref || null,
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
  };
  next.waits.by_ref[waitRef] = waitEntry;

  if (!gateEntry) return;

  if (event.type === 'wait.opened') {
    next.gates[gateEntry.gate_id] = {
      ...gateEntry,
      projection_source: 'canonical-events',
      status: 'PENDING_APPROVAL',
      wait_status: 'OPEN',
      scheduler_consumed: false,
      wait_ref: waitRef,
      wait_kind: event.data?.wait_kind || gateEntry.wait_kind || null,
      gate_title: event.data?.gate_title || gateEntry.gate_title || null,
      requested_at: event.data?.requested_at || event.occurred_at,
      deadline: event.data?.deadline || null,
      timeout_minutes: event.data?.timeout_minutes ?? null,
      timeout_policy: event.data?.timeout_policy || null,
      request_message_ref: event.data?.request_message_ref ?? null,
      request_artifact_path: event.data?.request_artifact_path ?? null,
      resolved_at: null,
      decision_by: null,
      decision_via: null,
      continued: null,
      reason: null,
      close_reason: null,
      latest_event_type: event.type,
      latest_event_at: event.occurred_at,
    };
    return;
  }

  const derived = deriveApprovalResolutionFromSignal(gateEntry.last_signal_kind, gateEntry.continued);
  next.gates[gateEntry.gate_id] = {
    ...gateEntry,
    projection_source: 'canonical-events',
    status: normalizeLifecycleTerminalStatus(gateEntry.status || derived.status || waitEntry.resolution_kind),
    wait_status: 'CLOSED',
    scheduler_consumed: gateEntry.scheduler_consumed === true || derived.scheduler_consumed === true,
    wait_ref: waitRef,
    resolved_at: waitEntry.closed_at || event.occurred_at,
    decision_by: waitEntry.decision_by || gateEntry.decision_by || null,
    decision_via: waitEntry.decision_via || gateEntry.decision_via || null,
    continued: waitEntry.close_reason === 'timed_out'
      ? (gateEntry.continued ?? derived.continued)
      : (gateEntry.continued ?? null),
    reason: gateEntry.reason || null,
    close_reason: waitEntry.close_reason || null,
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
  };
}

function applyResumeSignalToReadModels(next, event) {
  const signalRef = event.refs?.resume_signal_ref;
  if (!signalRef) return;

  const currentSignal = next.signals?.by_ref?.[signalRef] || {};
  const signalEntry = {
    ...currentSignal,
    resume_signal_ref: signalRef,
    wait_ref: event.refs?.wait_ref || currentSignal.wait_ref || null,
    gate_id: event.refs?.gate_id || currentSignal.gate_id || null,
    gate_type: event.refs?.gate_type || currentSignal.gate_type || null,
    gate_evaluation_ref: event.refs?.gate_evaluation_ref || currentSignal.gate_evaluation_ref || null,
    signal_kind: event.data?.signal_kind || event.refs?.signal_kind || currentSignal.signal_kind || null,
    received_via: event.data?.received_via || currentSignal.received_via || null,
    decision_by: event.data?.decision_by || currentSignal.decision_by || null,
    reason: event.data?.reason || currentSignal.reason || null,
    continued: event.data?.continued ?? currentSignal.continued ?? null,
    source_message_ref: event.data?.source_message_ref ?? currentSignal.source_message_ref ?? null,
    received_at: event.occurred_at,
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
  };
  next.signals.by_ref[signalRef] = signalEntry;

  if (signalEntry.wait_ref && next.waits?.by_ref?.[signalEntry.wait_ref]) {
    next.waits.by_ref[signalEntry.wait_ref] = {
      ...next.waits.by_ref[signalEntry.wait_ref],
      latest_signal_ref: signalRef,
      latest_signal_kind: signalEntry.signal_kind,
      latest_signal_at: event.occurred_at,
    };
  }

  const gateEntry = ensureGateReadModel(next, event.refs);
  if (!gateEntry) return;

  const derived = deriveApprovalResolutionFromSignal(signalEntry.signal_kind, signalEntry.continued);
  next.gates[gateEntry.gate_id] = {
    ...gateEntry,
    projection_source: 'canonical-events',
    wait_ref: event.refs?.wait_ref || gateEntry.wait_ref || null,
    status: derived.status || gateEntry.status || null,
    scheduler_consumed: gateEntry.scheduler_consumed === true || derived.scheduler_consumed === true,
    last_signal_kind: signalEntry.signal_kind,
    last_signal_ref: signalRef,
    last_signal_at: event.occurred_at,
    decision_by: signalEntry.decision_by || gateEntry.decision_by || null,
    decision_via: signalEntry.received_via || gateEntry.decision_via || null,
    continued: signalEntry.continued ?? derived.continued ?? gateEntry.continued ?? null,
    reason: signalEntry.reason || gateEntry.reason || null,
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
  };
}

function applyCooldownEventToReadModels(next, event) {
  const isModule = Boolean(event.refs?.module_id);
  const collection = isModule ? next.cooldowns.modules : next.cooldowns.gates;
  const key = isModule ? event.refs.module_id : event.refs.gate_id;
  if (!key) return;

  const existing = collection[key] || {};
  if (event.type === 'rate_limit.cooldown_started') {
    collection[key] = {
      ...existing,
      scope: isModule ? 'module' : 'gate',
      target_ref: event.refs?.primary_ref?.id || existing.target_ref || null,
      run_id: event.refs?.run_id || existing.run_id || null,
      module_id: event.refs?.module_id || existing.module_id || null,
      gate_id: event.refs?.gate_id || existing.gate_id || null,
      gate_type: event.refs?.gate_type || existing.gate_type || null,
      attempt: event.refs?.attempt ?? existing.attempt ?? null,
      pause_count: event.data?.pause_count ?? existing.pause_count ?? null,
      max_pauses: event.data?.max_pauses ?? existing.max_pauses ?? null,
      cooldown_hours: event.data?.cooldown_hours ?? existing.cooldown_hours ?? null,
      resume_at: event.data?.resume_at || existing.resume_at || null,
      detail: event.data?.detail || existing.detail || null,
      agent_type: event.data?.agent_type || existing.agent_type || null,
      dispatch_id: event.data?.dispatch_id ?? event.refs?.dispatch_id ?? existing.dispatch_id ?? null,
      gateway_label: event.data?.gateway_label ?? event.refs?.gateway_label ?? existing.gateway_label ?? null,
      session_key: event.data?.session_key ?? event.refs?.session_key ?? existing.session_key ?? null,
      commit_hash: event.data?.commit_hash ?? existing.commit_hash ?? null,
      projection_source: 'canonical-events',
      open: true,
      opened_at: event.occurred_at,
      completed_at: null,
      latest_event_type: event.type,
      latest_event_at: event.occurred_at,
    };
    return;
  }

  collection[key] = {
    ...existing,
    scope: existing.scope || (isModule ? 'module' : 'gate'),
    target_ref: existing.target_ref || event.refs?.primary_ref?.id || null,
    run_id: existing.run_id || event.refs?.run_id || null,
    module_id: existing.module_id || event.refs?.module_id || null,
    gate_id: existing.gate_id || event.refs?.gate_id || null,
    gate_type: existing.gate_type || event.refs?.gate_type || null,
    attempt: existing.attempt ?? event.refs?.attempt ?? null,
    pause_count: event.data?.pause_count ?? existing.pause_count ?? null,
    max_pauses: event.data?.max_pauses ?? existing.max_pauses ?? null,
    cooldown_hours: existing.cooldown_hours ?? null,
    resume_at: existing.resume_at || null,
    detail: event.data?.detail || existing.detail || null,
    agent_type: existing.agent_type || null,
    dispatch_id: existing.dispatch_id ?? event.refs?.dispatch_id ?? null,
    gateway_label: existing.gateway_label ?? event.refs?.gateway_label ?? null,
    session_key: existing.session_key ?? event.refs?.session_key ?? null,
    commit_hash: existing.commit_hash ?? null,
    projection_source: 'canonical-events',
    open: false,
    completed_at: event.data?.resumed_at || event.occurred_at,
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
  };
}

function applyLifecycleEventToReadModels(readModels, event) {
  const next = cloneSerializable(readModels) || createDefaultLifecycleReadModels({ _runId: event?.refs?.run_id || null });
  next.last_event_id = event.event_id;
  next.last_event_type = event.type;
  next.event_count = Number(next.event_count || 0) + 1;

  if (event.type === 'pipeline_run.started') {
    next.pipeline = {
      run_id: event.refs.run_id,
      run_ref: event.refs.run_ref,
      status: 'RUNNING',
      run_mode: event.data.run_mode,
      resume: event.data.resume,
      requested_module_id: event.data.requested_module_id,
      entrypoint: event.data.entrypoint,
      started_at: event.occurred_at,
      completed_at: null,
      exit_code: null,
      exit_reason: null,
      halt_reason: null,
      latest_event_type: event.type,
    };
  } else if (event.type === 'pipeline_run.completed') {
    next.pipeline = {
      ...(next.pipeline || {}),
      run_id: event.refs.run_id,
      run_ref: event.refs.run_ref,
      status: 'COMPLETED',
      completed_at: event.occurred_at,
      exit_code: event.data.exit_code,
      exit_reason: event.data.exit_reason,
      latest_event_type: event.type,
    };
  } else if (event.type === 'pipeline_run.halted') {
    next.pipeline = {
      ...(next.pipeline || {}),
      run_id: event.refs.run_id,
      run_ref: event.refs.run_ref,
      status: 'HALTED',
      completed_at: event.occurred_at,
      exit_code: event.data.exit_code,
      exit_reason: event.data.halt_reason,
      halt_reason: event.data.halt_reason,
      step_type: event.data.step_type,
      step_id: event.data.step_id,
      latest_event_type: event.type,
    };
  }

  if (event.type === 'wait.opened' || event.type === 'wait.closed') {
    applyWaitEventToReadModels(next, event);
  }

  if (event.type === 'resume_signal.received') {
    applyResumeSignalToReadModels(next, event);
  }

  if (event.type === 'rate_limit.cooldown_started' || event.type === 'rate_limit.cooldown_completed') {
    applyCooldownEventToReadModels(next, event);
  }

  if (event.type === 'recovery.stale_reset') {
    if (event.refs?.module_id) {
      const moduleId = event.refs.module_id;
      const existing = next.modules[moduleId] || { module_id: moduleId };
      next.modules[moduleId] = {
        ...existing,
        module_id: moduleId,
        module_attempt_ref: event.refs?.module_attempt_ref || existing.module_attempt_ref || null,
        current_attempt: event.refs?.attempt ?? existing.current_attempt ?? null,
        status: event.data?.recovery_target_status || existing.status || 'PENDING',
        current_phase: null,
        dispatch_id: event.refs?.dispatch_id ?? existing.dispatch_id ?? null,
        gateway_label: event.refs?.gateway_label ?? existing.gateway_label ?? null,
        session_key: event.refs?.session_key ?? existing.session_key ?? null,
        latest_event_type: event.type,
        latest_event_at: event.occurred_at,
        last_recovery_action: event.data?.recovery_action || null,
        last_recovery_reason: event.data?.reason || null,
        projection_source: 'canonical-events',
      };
      delete next.active_sessions.modules[moduleId];
    }

    if (event.refs?.gate_id) {
      const gateEntry = ensureGateReadModel(next, event.refs) || { gate_id: event.refs.gate_id };
      next.gates[event.refs.gate_id] = {
        ...gateEntry,
        status: event.data?.recovery_target_status || gateEntry.status || 'PENDING',
        scheduler_consumed: false,
        latest_event_type: event.type,
        latest_event_at: event.occurred_at,
        last_recovery_action: event.data?.recovery_action || null,
        last_recovery_reason: event.data?.reason || null,
        projection_source: 'canonical-events',
      };
      delete next.active_sessions.gates[event.refs.gate_id];
    }
  }

  if (event.refs?.module_id) {
    const moduleId = event.refs.module_id;
    const existing = next.modules[moduleId] || { module_id: moduleId };
    const opensAttempt = (
      existing.current_attempt == null
      || (event.refs.attempt != null && Number(event.refs.attempt) !== Number(existing.current_attempt))
    );
    const statusByEvent = {
      'module_attempt.started': 'IN_PROGRESS',
      'module_attempt.ready_for_testing': 'READY_FOR_TESTING',
      'module_attempt.testing_started': 'TESTING',
      'module_attempt.failed': 'FAIL',
      'module_attempt.passed': 'PASS',
      'module_attempt.blocked': 'BLOCKED',
    };
    const currentPhaseByEvent = {
      'module_attempt.started': 'forge',
      'module_attempt.ready_for_testing': null,
      'module_attempt.testing_started': 'buster',
      'module_attempt.failed': null,
      'module_attempt.passed': null,
      'module_attempt.blocked': null,
    };

    next.modules[moduleId] = {
      ...existing,
      module_id: moduleId,
      title: event.data.title || existing.title || null,
      module_dir: event.data.module_dir || existing.module_dir || null,
      current_attempt: event.refs.attempt ?? existing.current_attempt ?? null,
      module_attempt_ref: event.refs.module_attempt_ref || existing.module_attempt_ref || null,
      status: statusByEvent[event.type] || existing.status || null,
      current_phase: currentPhaseByEvent[event.type] !== undefined ? currentPhaseByEvent[event.type] : existing.current_phase,
      attempt_started_at: opensAttempt ? event.occurred_at : existing.attempt_started_at || null,
      phase_started_at: (event.type === 'module_attempt.started' || event.type === 'module_attempt.testing_started') ? event.occurred_at : (event.type === 'module_attempt.ready_for_testing' || event.type === 'module_attempt.failed' || event.type === 'module_attempt.passed' || event.type === 'module_attempt.blocked') ? null : existing.phase_started_at || null,
      completed_at: (event.type === 'module_attempt.passed') ? event.occurred_at : (event.type === 'module_attempt.failed' || event.type === 'module_attempt.blocked') ? null : existing.completed_at || null,
      fail_count: event.type === 'module_attempt.failed' || event.type === 'module_attempt.blocked'
        ? Math.max(Number(existing.fail_count || 0), Number(event.refs.attempt || event.data.blocked_fail_count || 0))
        : existing.fail_count || 0,
      last_failure: event.type === 'module_attempt.failed' ? (event.data.summary || event.data.reason || null) : existing.last_failure || null,
      blocked_reason: event.type === 'module_attempt.blocked' ? event.data.reason : existing.blocked_reason || null,
      dispatch_id: event.refs.dispatch_id ?? existing.dispatch_id ?? null,
      gateway_label: event.refs.gateway_label ?? existing.gateway_label ?? null,
      session_key: event.refs.session_key ?? existing.session_key ?? null,
      projection_source: 'canonical-events',
      latest_event_type: event.type,
      latest_event_at: event.occurred_at,
    };
  }

  recomputeProgression(next);
  return next;
}

function ensureLifecycleEventLegal(config, readModels, proposal) {
  const type = proposal?.type;
  const refs = proposal?.refs || {};
  const waitState = refs?.wait_ref ? readModels?.waits?.by_ref?.[refs.wait_ref] || null : null;
  const gateState = refs?.gate_id ? readModels?.gates?.[refs.gate_id] || null : null;
  const cooldownScope = refs?.module_id ? 'modules' : (refs?.gate_id ? 'gates' : null);
  const cooldownKey = refs?.module_id || refs?.gate_id || null;
  const cooldownState = cooldownScope && cooldownKey
    ? readModels?.cooldowns?.[cooldownScope]?.[cooldownKey] || null
    : null;
  const pipelineState = readModels?.pipeline || null;
  const moduleState = refs?.module_id ? readModels?.modules?.[refs.module_id] || null : null;
  const canBootstrapAttemptFromLegacyStatus = isLegacyModuleStatusBootstrapEnabled(config)
    && !moduleState
    && refs?.attempt != null
    && [
      'module_attempt.ready_for_testing',
      'module_attempt.testing_started',
      'module_attempt.failed',
      'module_attempt.passed',
      'module_attempt.blocked',
    ].includes(type);

  if (type === 'pipeline_run.started') {
    if (pipelineState?.status && pipelineState.run_id === refs.run_id) {
      throw new Error(`Illegal lifecycle append: pipeline run '${refs.run_id}' already started`);
    }
    return;
  }

  if (type === 'pipeline_run.completed' || type === 'pipeline_run.halted') {
    if (!pipelineState || pipelineState.run_id !== refs.run_id) {
      throw new Error(`Illegal lifecycle append: pipeline run '${refs.run_id}' has not started`);
    }
    if (pipelineState.status === 'COMPLETED' || pipelineState.status === 'HALTED') {
      throw new Error(`Illegal lifecycle append: pipeline run '${refs.run_id}' is already terminal`);
    }
    return;
  }

  if (type === 'wait.opened') {
    if (!refs?.wait_ref) throw new Error('Illegal lifecycle append: wait.opened requires wait_ref');
    if (waitState?.state === 'OPEN') {
      throw new Error(`Illegal lifecycle append: wait '${refs.wait_ref}' is already open`);
    }
    if (gateState?.wait_status === 'CLOSED' && gateState?.status) {
      throw new Error(`Illegal lifecycle append: gate '${refs.gate_id}' already resolved its wait`);
    }
    return;
  }

  if (type === 'resume_signal.received') {
    const signalKind = String(proposal?.data?.signal_kind || refs?.signal_kind || '').trim().toLowerCase();
    if (!refs?.resume_signal_ref) throw new Error('Illegal lifecycle append: resume_signal.received requires resume_signal_ref');
    if (!waitState || waitState.state !== 'OPEN') {
      throw new Error(`Illegal lifecycle append: signal '${refs.resume_signal_ref}' has no open wait`);
    }
    if ((refs?.gate_type || '').toLowerCase() === 'approval' && !APPROVAL_SIGNAL_KINDS.has(signalKind)) {
      throw new Error(`Illegal lifecycle append: approval signal '${signalKind || 'unknown'}' is unsupported`);
    }
    return;
  }

  if (type === 'wait.closed') {
    if (!waitState || waitState.state !== 'OPEN') {
      throw new Error(`Illegal lifecycle append: wait '${refs.wait_ref || 'unknown'}' is not open`);
    }
    if (!proposal?.data?.close_reason) {
      throw new Error(`Illegal lifecycle append: wait '${refs.wait_ref}' close_reason is required`);
    }
    return;
  }

  if (type === 'rate_limit.cooldown_started') {
    if (cooldownState?.open) {
      throw new Error(`Illegal lifecycle append: cooldown already open for '${cooldownKey}'`);
    }
    return;
  }

  if (type === 'rate_limit.cooldown_completed') {
    if (!cooldownState?.open) {
      throw new Error(`Illegal lifecycle append: cooldown is not open for '${cooldownKey}'`);
    }
    return;
  }

  if (type === 'recovery.stale_reset') {
    if (!refs?.module_id && !refs?.gate_id) {
      throw new Error('Illegal lifecycle append: recovery.stale_reset requires module_id or gate_id');
    }
    if (!proposal?.data?.recovery_action) {
      throw new Error('Illegal lifecycle append: recovery.stale_reset requires recovery_action');
    }
    if (!proposal?.data?.reason) {
      throw new Error('Illegal lifecycle append: recovery.stale_reset requires reason');
    }
    return;
  }

  if (refs?.module_id) {
    if (type === 'module_attempt.started') {
      if (moduleState && moduleState.status && moduleState.status !== 'PASS' && moduleState.current_attempt === refs.attempt && moduleState.latest_event_type === 'module_attempt.started') {
        throw new Error(`Illegal lifecycle append: module '${refs.module_id}' attempt ${refs.attempt} already started`);
      }
      return;
    }

    if (type === 'module_attempt.ready_for_testing') {
      if (!moduleState) {
        if (Number(refs.attempt || 0) !== 1) {
          throw new Error(`Illegal lifecycle append: module '${refs.module_id}' cannot open attempt ${refs.attempt} at READY_FOR_TESTING`);
        }
        return;
      }

      const currentAttempt = Number(moduleState.current_attempt || 0);
      const requestedAttempt = Number(refs.attempt || 0);

      if (requestedAttempt === currentAttempt) return;

      const canAdvanceAttempt = requestedAttempt === currentAttempt + 1
        && ['FAIL', 'BLOCKED'].includes(moduleState.status);
      if (canAdvanceAttempt) return;

      throw new Error(`Illegal lifecycle append: module '${refs.module_id}' attempt mismatch (${refs.attempt} != ${moduleState.current_attempt})`);
    }

    if (canBootstrapAttemptFromLegacyStatus) {
      return;
    }

    if (!moduleState && type !== 'module_attempt.started') {
      throw new Error(`Illegal lifecycle append: module '${refs.module_id}' has no open attempt for ${type}`);
    }

    if (moduleState && moduleState.current_attempt != null && refs.attempt != null) {
      const currentAttempt = Number(moduleState.current_attempt);
      const requestedAttempt = Number(refs.attempt);
      const canBridgeRetryGap = requestedAttempt === currentAttempt + 1
        && ['FAIL', 'BLOCKED'].includes(moduleState.status);
      if (canBridgeRetryGap) return;
    }

    if (moduleState && moduleState.current_attempt != null && refs.attempt != null && Number(moduleState.current_attempt) !== Number(refs.attempt) && type !== 'module_attempt.started') {
      throw new Error(`Illegal lifecycle append: module '${refs.module_id}' attempt mismatch (${refs.attempt} != ${moduleState.current_attempt})`);
    }
  }
}

export function appendLifecycleEvent(config, proposal = {}) {
  if (!proposal?.type) throw new Error('appendLifecycleEvent requires type');
  if (!proposal?.refs?.primary_ref?.id) throw new Error('appendLifecycleEvent requires refs.primary_ref.id');
  const eventsPath = lifecycleEventsPath(config);
  const readModels = loadLifecycleReadModels(config);
  const idempotencyKey = buildLifecycleIdempotencyKey(proposal.type, proposal.refs, proposal.data || {});
  const existing = readLifecycleEvents(config).find((entry) => entry.idempotency_key === idempotencyKey);
  if (existing) {
    return { record: existing, deduped: true, readModels };
  }

  ensureLifecycleEventLegal(config, readModels, proposal);

  const event = {
    schemaVersion: LIFECYCLE_READ_MODELS_VERSION,
    event_id: createOpaqueId('event'),
    type: proposal.type,
    occurred_at: proposal.occurredAt || new Date().toISOString(),
    recorded_at: new Date().toISOString(),
    idempotency_key: idempotencyKey,
    refs: cloneSerializable(proposal.refs),
    data: cloneSerializable(proposal.data || {}),
  };

  if (!Array.isArray(config._lifecycleEventsCache)) config._lifecycleEventsCache = [];
  config._lifecycleEventsCache.push(cloneSerializable(event));
  appendJsonLine(eventsPath, event);
  const nextReadModels = saveLifecycleReadModels(config, applyLifecycleEventToReadModels(readModels, event));
  return { record: event, deduped: false, readModels: nextReadModels };
}

function buildPipelineStartData(config, progress, opts = {}) {
  const executionOrder = Array.isArray(progress?.execution_order) ? [...progress.execution_order] : [];
  return {
    run_mode: opts.module ? 'single_module' : 'full',
    resume: opts.resume === true,
    requested_module_id: opts.module || null,
    entrypoint: 'pipeline_runner',
    execution_order: executionOrder,
    modules: Object.entries(progress?.modules || {}).map(([moduleId, mod]) => ({
      module_id: moduleId,
      title: mod?.title || null,
      dir: mod?.dir || null,
      depends_on: Array.isArray(mod?.depends_on) ? [...mod.depends_on] : [],
      stages: Array.isArray(mod?.stages) ? [...mod.stages] : [],
    })),
    gates: Object.entries(progress?.gates || {}).map(([gateId, gate]) => ({
      gate_id: gateId,
      gate_type: gate?.type || null,
      title: gate?.title || null,
    })),
    models: cloneSerializable(config?.models || null),
    nova_prompt_present: Boolean(opts.novaPrompt),
  };
}

export function appendPipelineLifecycleEvent(config, type, {
  progress = null,
  opts = {},
  result = null,
  stepType = null,
  stepId = null,
  haltReason = null,
} = {}) {
  const refs = buildPipelineRefs(config);
  let data;

  if (type === 'pipeline_run.started') {
    data = buildPipelineStartData(config, progress, opts);
  } else if (type === 'pipeline_run.completed') {
    const readModels = loadLifecycleReadModels(config);
    data = {
      exit_code: result?.exit ?? 0,
      exit_reason: result?.reason || 'PIPELINE_COMPLETE',
      duration_seconds: null,
      modules_passed: readModels?.progression?.modules_passed ?? null,
      modules_failed: readModels?.progression?.modules_failed ?? null,
      modules_blocked: readModels?.progression?.modules_blocked ?? null,
      modules_total: readModels?.progression?.modules_total ?? null,
      total_cost_usd: null,
      summary_json_path: config?._runLogDir ? path.join(config._runLogDir, 'summary.json') : null,
      pipeline_summary_path: config?._logDir ? path.join(config._logDir, 'pipeline', 'summary.json') : null,
      latest_json_path: config?._logDir ? path.join(config._logDir, 'pipeline', 'latest.json') : null,
    };
  } else if (type === 'pipeline_run.halted') {
    data = {
      halt_reason: haltReason || result?.reason || 'halted',
      exit_code: result?.exit ?? null,
      step_type: stepType || null,
      step_id: stepId || null,
      attempt: result?.attempt ?? null,
      dispatch_id: result?.dispatch_id ?? null,
      gateway_label: result?.gateway_label ?? null,
      session_key: result?.session_key ?? null,
      last_failure: result?.reason || null,
      fail_count: result?.fail_count ?? null,
    };
  } else {
    throw new Error(`Unsupported pipeline lifecycle event type: ${type}`);
  }

  return appendLifecycleEvent(config, { type, refs, data });
}

export function appendWaitLifecycleEvent(config, type, {
  gateId,
  gateType = 'approval',
  attempt = 1,
  waitKind = 'approval',
  signalKind = null,
  data = {},
  occurredAt = null,
} = {}) {
  const refs = type === 'resume_signal.received'
    ? buildResumeSignalRefs(config, { gateId, gateType, attempt, waitKind, signalKind: signalKind || data.signal_kind })
    : buildWaitRefs(config, { gateId, gateType, attempt, waitKind });

  return appendLifecycleEvent(config, {
    type,
    refs,
    data,
    ...(occurredAt ? { occurredAt } : {}),
  });
}

export function appendCooldownLifecycleEvent(config, type, {
  moduleId = null,
  gateId = null,
  gateType = null,
  attempt = null,
  pauseCount = null,
  maxPauses = null,
  cooldownHours = null,
  resumeAt = null,
  resumedAt = null,
  detail = null,
  agentType = null,
  dispatchId = null,
  gatewayLabel = null,
  sessionKey = null,
  commitHash = null,
  occurredAt = null,
} = {}) {
  const refs = buildCooldownRefs(config, {
    moduleId,
    gateId,
    gateType,
    attempt,
  });
  refs.dispatch_id = dispatchId ?? refs.dispatch_id ?? null;
  refs.gateway_label = gatewayLabel ?? refs.gateway_label ?? null;
  refs.session_key = sessionKey ?? refs.session_key ?? null;

  const data = type === 'rate_limit.cooldown_started'
    ? {
      pause_count: pauseCount ?? null,
      max_pauses: maxPauses ?? null,
      cooldown_hours: cooldownHours ?? null,
      resume_at: resumeAt || null,
      detail: detail || null,
      agent_type: agentType || null,
      dispatch_id: dispatchId ?? null,
      gateway_label: gatewayLabel ?? null,
      session_key: sessionKey ?? null,
      commit_hash: commitHash ?? null,
    }
    : {
      pause_count: pauseCount ?? null,
      max_pauses: maxPauses ?? null,
      resumed_at: resumedAt || occurredAt || new Date().toISOString(),
      detail: detail || null,
    };

  return appendLifecycleEvent(config, {
    type,
    refs,
    data,
    ...(occurredAt ? { occurredAt } : {}),
  });
}

export function getLifecycleGateState(config, gateId) {
  if (!gateId) return null;
  return cloneSerializable(loadLifecycleReadModels(config)?.gates?.[gateId] || null);
}

export function getLifecycleModuleState(config, moduleId) {
  if (!moduleId) return null;
  return cloneSerializable(loadLifecycleReadModels(config)?.modules?.[moduleId] || null);
}

export function appendStaleRecoveryLifecycleEvent(config, {
  moduleId = null,
  gateId = null,
  gateType = null,
  status = null,
  dir = null,
  attempt = null,
  recoveryTargetStatus = null,
  recoveryAction = null,
  reason = null,
  sessionKey = null,
  dispatchId = null,
  gatewayLabel = null,
  staleEvidence = null,
  occurredAt = null,
} = {}) {
  let refs;
  if (moduleId) {
    refs = buildModuleAttemptRefs(config, {
      ...(status || {}),
      module_id: moduleId,
      active_agent: status?.active_agent || {
        session_key: sessionKey || null,
        dispatch_id: dispatchId || null,
        gateway_label: gatewayLabel || null,
        attempt: attempt ?? null,
      },
    }, dir || moduleId, {
      attempt: attempt ?? null,
    }, getLifecycleModuleState(config, moduleId));
  } else {
    refs = buildGateEvaluationRefs(config, {
      gateId,
      gateType: gateType || null,
      attempt: Number(attempt || 1),
    });
    refs.dispatch_id = dispatchId ?? null;
    refs.gateway_label = gatewayLabel ?? null;
    refs.session_key = sessionKey ?? null;
  }

  return appendLifecycleEvent(config, {
    type: 'recovery.stale_reset',
    refs,
    data: {
      recovery_target_status: recoveryTargetStatus || 'PENDING',
      recovery_action: recoveryAction || null,
      reason: reason || 'stale recovery',
      session_key: sessionKey ?? null,
      dispatch_id: dispatchId ?? null,
      gateway_label: gatewayLabel ?? null,
      stale_evidence: staleEvidence ? cloneSerializable(staleEvidence) : null,
    },
    ...(occurredAt ? { occurredAt } : {}),
  });
}

export function getLifecycleCooldown(config, { stepType = null, stepId = null } = {}) {
  const readModels = loadLifecycleReadModels(config);
  if (stepType === 'module') return cloneSerializable(readModels?.cooldowns?.modules?.[stepId] || null);
  if (stepType === 'gate') return cloneSerializable(readModels?.cooldowns?.gates?.[stepId] || null);
  return null;
}

function buildModuleLifecycleData(config, dir, status, mutation = {}) {
  const progress = getActiveProgress(config);
  const moduleConfig = resolveModuleConfig(progress, status?.module_id, dir);
  const phase = mutation.phase || mutation.previousPhase || status?.current_phase || status?.blockedPhase || null;
  const attempt = resolveModuleAttempt(status, mutation);
  const shared = {
    title: status?.title || moduleConfig?.title || null,
    module_dir: dir || moduleConfig?.dir || null,
  };

  switch (mutation.eventType) {
    case 'module_attempt.started':
      return {
        ...shared,
        stages: Array.isArray(moduleConfig?.stages) ? [...moduleConfig.stages] : [],
        resume_from_status: mutation.oldStatus,
        blueprint_action: 'skipped',
        fail_count_before: Math.max(0, attempt - 1),
        validation_attempt: status?.validation?.attempt ?? attempt,
      };
    case 'module_attempt.ready_for_testing':
      return {
        from_phase: mutation.previousPhase || (mutation.oldStatus === 'IN_PROGRESS' ? 'forge' : 'pipeline_forced'),
        forced_by_pipeline: mutation.previousPhase !== 'forge',
        commit_hash: resolveModuleCommit(status),
        delivery_lint_required: !(status?.validation?.delivery_lint_passed),
        pre_check_required: !(status?.validation?.pre_check_passed),
        reason: mutation.note || null,
      };
    case 'module_attempt.testing_started':
      return {
        from_status: mutation.oldStatus || 'READY_FOR_TESTING',
        git_sync_completed: true,
        delivery_lint_passed: Boolean(status?.validation?.delivery_lint_passed),
        pre_check_passed: Boolean(status?.validation?.pre_check_passed),
        commit_hash: resolveModuleCommit(status),
      };
    case 'module_attempt.failed': {
      const reason = status?.completion_summary || mutation.completionSummary || mutation.note || status?.fail_summaries?.at?.(-1)?.summary || null;
      return {
        phase: phase || 'unknown',
        failure_class: normalizeFailureClass(phase, reason),
        reason: reason || 'Module attempt failed',
        old_status: mutation.oldStatus || null,
        summary: mutation.note || reason || null,
        dispatch_id: resolveStatusDispatchId(status),
        gateway_label: resolveStatusGatewayLabel(status),
        session_key: resolveStatusSessionKey(status),
        commit_hash: resolveModuleCommit(status),
        validator_name: null,
        suite_names: [],
      };
    }
    case 'module_attempt.passed':
      return {
        phase: phase || mutation.previousPhase || 'buster',
        old_status: mutation.oldStatus || null,
        duration_seconds: null,
        cost_estimate_usd: null,
        commit_hash: resolveModuleCommit(status),
        summary: mutation.note || status?.completion_summary || null,
      };
    case 'module_attempt.blocked':
      return {
        blocked_phase: status?.blockedPhase || phase || null,
        reason: status?.blockedReason || mutation.blockedReason || mutation.note || 'blocked',
        old_status: mutation.oldStatus || null,
        blocked_fail_count: status?.blockedFailCount ?? mutation.blockedFailCount ?? status?.fail_count ?? null,
        dispatch_id: resolveStatusDispatchId(status),
        gateway_label: resolveStatusGatewayLabel(status),
        session_key: resolveStatusSessionKey(status),
      };
    default:
      throw new Error(`Unsupported module lifecycle event type: ${mutation.eventType}`);
  }
}

export function appendModuleLifecycleEvent(config, dir, status, mutation = {}) {
  if (!mutation?.eventType) return null;
  const currentModuleState = loadLifecycleReadModels(config)?.modules?.[status?.module_id || dir] || null;
  const refs = buildModuleAttemptRefs(config, status, dir, mutation, currentModuleState);
  const data = buildModuleLifecycleData(config, dir, status, mutation);
  return appendLifecycleEvent(config, {
    type: mutation.eventType,
    refs,
    data,
    occurredAt: mutation.now || new Date().toISOString(),
  });
}


export function resetLifecycleStore(config) {
  return saveLifecycleReadModels(config, createDefaultLifecycleReadModels(config));
}
