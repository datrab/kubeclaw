// services/status-store-compat.js — compatibility projection + gate output helpers

import fs from 'fs';
import path from 'path';

import { statusPath, swarmRoot, gateStatusPath } from '../core/paths.js';
import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
} from './correlation.js';
import {
  appendWaitLifecycleEvent,
  buildGateEvaluationRefs,
  buildModuleAttemptRefs,
  buildResumeSignalRefs,
  cloneSerializable,
  deriveApprovalResolutionFromState,
  getActiveProgress,
  getLifecycleGateState,
  getLifecycleModuleState,
  isLegacyModuleStatusBootstrapEnabled,
  loadLifecycleReadModels,
  recomputeProgression,
  resolveModuleConfig,
  saveLifecycleReadModels,
} from './status-store-lifecycle.js';

export function getAuthoritativeModuleState(config, moduleId, {
  dir = null,
  status = null,
  allowCompatibilityBootstrap = null,
} = {}) {
  const resolvedModuleId = moduleId || status?.module_id || dir || null;
  if (!resolvedModuleId) return null;

  const lifecycleState = getLifecycleModuleState(config, resolvedModuleId);
  if (lifecycleState) return lifecycleState;
  const bootstrapAllowed = allowCompatibilityBootstrap === true
    || (allowCompatibilityBootstrap == null && isLegacyModuleStatusBootstrapEnabled(config));
  if (!bootstrapAllowed || !status) return null;

  return cloneSerializable(
    projectStatusIntoReadModels(config, dir || status?.module_dir || resolvedModuleId, status, resolvedModuleId, {
      allowBootstrap: true,
    })?.modules?.[resolvedModuleId] || null,
  );
}

function normalizeCompatibilityGateStatus({ gateType = null, output = null, gateStatus = null, busterCompletion = null } = {}) {
  if (gateType === 'buster') {
    if (busterCompletion?.isPass) {
      return {
        status: 'PASS',
        completed: true,
        completion_source: busterCompletion.source || null,
      };
    }

    return { status: 'PENDING', completed: false, completion_source: null };
  }

  if (output?.isPass) {
    return {
      status: 'PASS',
      completed: true,
      completion_source: 'output_file',
    };
  }

  const outputStatus = String(output?.data?.status || '').trim().toUpperCase();
  if (output?.exists && outputStatus) {
    return {
      status: outputStatus,
      completed: false,
      completion_source: 'output_file',
    };
  }

  return { status: 'PENDING', completed: false, completion_source: null };
}

export function projectGateCompatibilityState(config, gateId, gate = null, {
  output = null,
  gateStatus = null,
  busterCompletion = null,
  approvalState = undefined,
} = {}) {
  if (!gateId) return null;

  if ((gate?.type || '').toLowerCase() === 'approval') {
    const nextApprovalState = approvalState === undefined
      ? gateStatus?.data || null
      : approvalState;
    const projected = syncApprovalWaitState(config, gateId, gate, nextApprovalState);
    const lifecycleGate = getLifecycleGateState(config, gateId) || projected || null;
    if (!lifecycleGate) return null;
    return {
      ...lifecycleGate,
      completed: lifecycleGate.scheduler_consumed === true,
      completion_source: lifecycleGate.projection_source || 'canonical-events',
    };
  }

  const readModels = loadLifecycleReadModels(config);
  const existing = readModels?.gates?.[gateId] || { gate_id: gateId };
  const normalized = normalizeCompatibilityGateStatus({
    gateType: gate?.type || null,
    output,
    gateStatus,
    busterCompletion,
  });

  const nextGate = {
    ...existing,
    gate_id: gateId,
    gate_type: gate?.type || existing.gate_type || null,
    gate_ref: existing.gate_ref || `gate:${gateId}`,
    status: normalized.status,
    completed: normalized.completed,
    scheduler_consumed: normalized.completed === true,
    title: gate?.title || existing.title || null,
    projection_source: normalized.completion_source || 'compat:pending',
    completion_source: normalized.completion_source || null,
    compatibility_output_exists: output?.exists === true,
    compatibility_output_status: output?.data?.status || null,
    compatibility_gate_status_exists: gateStatus?.exists === true,
    compatibility_gate_status: gateStatus?.data?.status || null,
    compatibility_output_path: gate?.output_file ? path.join(swarmRoot(config), gate.output_file) : null,
    compatibility_state_path: gateStatusPath(config, gateId),
    latest_event_type: existing.latest_event_type || null,
    latest_event_at: existing.latest_event_at || null,
  };

  readModels.gates[gateId] = nextGate;
  saveLifecycleReadModels(config, readModels);
  return cloneSerializable(nextGate);
}

function projectApprovalGateCompatibilityState(readModels, gateId, gate = null, fallbackState = null) {
  const gateEntry = readModels?.gates?.[gateId] || null;
  if (!gateEntry) return fallbackState || null;

  const waitEntry = gateEntry.wait_ref ? readModels?.waits?.by_ref?.[gateEntry.wait_ref] || null : null;
  const normalizedTimeoutPolicy = gateEntry.timeout_policy || waitEntry?.timeout_policy || fallbackState?.timeout_policy || 'BLOCK';
  const timeoutMinutes = gateEntry.timeout_minutes ?? waitEntry?.timeout_minutes ?? fallbackState?.timeout_minutes ?? null;
  const requestedAt = gateEntry.requested_at || waitEntry?.requested_at || fallbackState?.requested_at || null;
  const deadline = gateEntry.deadline || waitEntry?.deadline || fallbackState?.deadline || null;

  return {
    ...(fallbackState || {}),
    gate_id: gateId,
    gate_type: gateEntry.gate_type || gate?.type || fallbackState?.gate_type || 'approval',
    status: gateEntry.status || fallbackState?.status || 'PENDING_APPROVAL',
    run_id: gateEntry.run_id || fallbackState?.run_id || readModels?.run_id || null,
    project: fallbackState?.project || null,
    requested_at: requestedAt,
    deadline,
    timeout_minutes: timeoutMinutes,
    timeout_policy: normalizedTimeoutPolicy,
    resolved_at: gateEntry.resolved_at || waitEntry?.closed_at || fallbackState?.resolved_at || null,
    decision_by: gateEntry.decision_by || waitEntry?.decision_by || fallbackState?.decision_by || null,
    decision_via: gateEntry.decision_via || waitEntry?.decision_via || fallbackState?.decision_via || null,
    continued: gateEntry.continued ?? fallbackState?.continued ?? null,
    reason: gateEntry.reason || fallbackState?.reason || null,
    request_message_ref: gateEntry.request_message_ref ?? waitEntry?.request_message_ref ?? fallbackState?.request_message_ref ?? null,
  };
}

export function syncApprovalWaitState(config, gateId, gate = null, state = null) {
  const normalizedState = state && typeof state === 'object'
    ? cloneSerializable(state)
    : null;
  const initialReadModels = loadLifecycleReadModels(config);
  const existingGate = initialReadModels?.gates?.[gateId] || null;

  if (existingGate && existingGate.wait_status === 'CLOSED' && existingGate.status) {
    return projectApprovalGateCompatibilityState(initialReadModels, gateId, gate, normalizedState);
  }

  if (!normalizedState) {
    return existingGate
      ? projectApprovalGateCompatibilityState(initialReadModels, gateId, gate, null)
      : null;
  }

  const attempt = 1;
  const waitOpenedAt = normalizedState.requested_at || normalizedState.updated_at || normalizedState.resolved_at || new Date().toISOString();
  const pendingState = String(normalizedState.status || '').trim().toUpperCase() === 'PENDING_APPROVAL';

  if (!existingGate || !existingGate.wait_ref) {
    appendWaitLifecycleEvent(config, 'wait.opened', {
      gateId,
      gateType: gate?.type || normalizedState.gate_type || 'approval',
      attempt,
      waitKind: 'approval',
      occurredAt: waitOpenedAt,
      data: {
        wait_kind: 'approval',
        gate_title: gate?.title || normalizedState.gate_title || null,
        requested_at: normalizedState.requested_at || waitOpenedAt,
        deadline: normalizedState.deadline || null,
        timeout_minutes: normalizedState.timeout_minutes ?? null,
        timeout_policy: normalizedState.timeout_policy || 'BLOCK',
        request_message_ref: normalizedState.request_message_ref ?? null,
        request_artifact_path: normalizedState.request_artifact_path ?? null,
      },
    });
  }

  if (!pendingState) {
    const resolution = deriveApprovalResolutionFromState(normalizedState);
    if (resolution.signalKind) {
      appendWaitLifecycleEvent(config, 'resume_signal.received', {
        gateId,
        gateType: gate?.type || normalizedState.gate_type || 'approval',
        attempt,
        waitKind: 'approval',
        signalKind: resolution.signalKind,
        occurredAt: normalizedState.resolved_at || normalizedState.updated_at || new Date().toISOString(),
        data: {
          signal_kind: resolution.signalKind,
          received_via: normalizedState.decision_via || (resolution.closeReason === 'timed_out' ? 'timeout' : 'openclaw'),
          decision_by: normalizedState.decision_by || null,
          reason: normalizedState.reason || null,
          continued: normalizedState.continued ?? null,
          source_message_ref: normalizedState.request_message_ref ?? null,
        },
      });
      appendWaitLifecycleEvent(config, 'wait.closed', {
        gateId,
        gateType: gate?.type || normalizedState.gate_type || 'approval',
        attempt,
        waitKind: 'approval',
        occurredAt: normalizedState.resolved_at || normalizedState.updated_at || new Date().toISOString(),
        data: {
          close_reason: resolution.closeReason,
          closed_at: normalizedState.resolved_at || normalizedState.updated_at || new Date().toISOString(),
          resolution_kind: resolution.resolutionKind,
          decision_by: normalizedState.decision_by || null,
          decision_via: normalizedState.decision_via || null,
          resume_signal_ref: buildResumeSignalRefs(config, {
            gateId,
            gateType: gate?.type || normalizedState.gate_type || 'approval',
            attempt,
            waitKind: 'approval',
            signalKind: resolution.signalKind,
          }).resume_signal_ref,
        },
      });
    }
  }

  return projectApprovalGateCompatibilityState(loadLifecycleReadModels(config), gateId, gate, normalizedState);
}

function projectStatusIntoReadModels(config, dir, status, moduleIdOverride = null, {
  allowBootstrap = false,
} = {}) {
  const readModels = loadLifecycleReadModels(config);
  const moduleId = status?.module_id || moduleIdOverride || dir;
  const progress = getActiveProgress(config);
  const moduleConfig = resolveModuleConfig(progress, moduleId, dir);
  const attempt = (status?.status === 'FAIL' || status?.status === 'BLOCKED')
    ? Math.max(1, Number(status?.fail_count || 1))
    : Math.max(1, Number(status?.fail_count || 0) + 1);
  const existing = readModels.modules[moduleId] || null;
  if (!existing && allowBootstrap !== true) return readModels;

  const preserveCanonicalControl = existing?.projection_source === 'canonical-events';
  const compatibilityProjectionSource = existing ? 'status.json' : 'status.json:migration';
  const moduleEntry = {
    ...(existing || {}),
    module_id: moduleId,
    title: status?.title || existing?.title || moduleConfig?.title || null,
    module_dir: dir || existing?.module_dir || moduleConfig?.dir || null,
    ...(preserveCanonicalControl ? {} : {
      status: status?.status || existing?.status || 'PENDING',
      current_phase: status?.current_phase || existing?.current_phase || null,
      current_attempt: attempt,
      fail_count: status?.fail_count || 0,
      attempt_started_at: status?.attempt_started_at || existing?.attempt_started_at || null,
      phase_started_at: status?.phase_started_at || existing?.phase_started_at || null,
      completed_at: status?.completed_at || existing?.completed_at || null,
      blocked_reason: status?.blockedReason || existing?.blocked_reason || null,
      blocked_phase: status?.blockedPhase || existing?.blocked_phase || null,
      blocked_fail_count: status?.blockedFailCount ?? existing?.blocked_fail_count ?? null,
      dispatch_id: resolveStatusDispatchId(status),
      gateway_label: resolveStatusGatewayLabel(status),
      session_key: resolveStatusSessionKey(status),
      projection_source: compatibilityProjectionSource,
    }),
    updated_at: status?.updated_at || null,
    completion_summary: status?.completion_summary || null,
    validation: cloneSerializable(status?.validation || null),
    cost: cloneSerializable(status?.cost || null),
    compatibility_status_path: statusPath(config, dir),
    compatibility_projection_source: 'status.json',
    compatibility_status: status?.status || 'PENDING',
    compatibility_current_phase: status?.current_phase || null,
  };
  readModels.modules[moduleId] = moduleEntry;

  if (status?.active_agent) {
    readModels.active_sessions.modules[moduleId] = {
      attempt: status.active_agent.attempt ?? moduleEntry.current_attempt,
      dispatch_id: status.active_agent.dispatch_id || moduleEntry.dispatch_id || null,
      gateway_label: status.active_agent.gateway_label || status.active_agent.label || moduleEntry.gateway_label || null,
      session_key: status.active_agent.session_key || moduleEntry.session_key || null,
      runtime: status.active_agent.runtime || null,
      model: status.active_agent.model || null,
      updated_at: status.updated_at || new Date().toISOString(),
    };
  } else {
    delete readModels.active_sessions.modules[moduleId];
  }

  const cooldownUntil = status?.rate_limit?.cooldown_until || status?.cooldown_until || null;
  const existingCooldown = readModels.cooldowns.modules[moduleId] || null;
  if (status?.status === 'RATE_LIMITED' || cooldownUntil) {
    readModels.cooldowns.modules[moduleId] = {
      ...(existingCooldown || {}),
      status: status?.status || existingCooldown?.status || null,
      cooldown_until: cooldownUntil || existingCooldown?.cooldown_until || existingCooldown?.resume_at || null,
      updated_at: status?.updated_at || new Date().toISOString(),
      projection_source: 'status.json',
    };
  } else if (!existingCooldown) {
    delete readModels.cooldowns.modules[moduleId];
  } else {
    readModels.cooldowns.modules[moduleId] = {
      ...existingCooldown,
      status: status?.status || existingCooldown.status || null,
      updated_at: status?.updated_at || new Date().toISOString(),
      projection_source: existingCooldown.projection_source || 'canonical-events',
    };
  }

  recomputeProgression(readModels);
  return saveLifecycleReadModels(config, readModels);
}

export function projectModuleCompatibilityState(config, dir, status, moduleId = null, {
  allowBootstrap = isLegacyModuleStatusBootstrapEnabled(config),
} = {}) {
  const resolvedModuleId = status?.module_id || moduleId || dir || null;
  if (!status) return getLifecycleModuleState(config, resolvedModuleId);
  return cloneSerializable(projectStatusIntoReadModels(config, dir, status, resolvedModuleId, {
    allowBootstrap,
  })?.modules?.[resolvedModuleId] || null);
}

export function readGateOutput(config, gate) {
  if (!gate?.output_file) return { exists: false, data: null, isPass: false };
  const outPath = path.join(swarmRoot(config), gate.output_file);
  if (!fs.existsSync(outPath)) return { exists: false, data: null, isPass: false };
  try {
    const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const s = (data.status || '').toUpperCase();
    const isFail = s === 'FAIL' || s === 'ISSUES_FOUND' || s === 'NO-GO';
    return { exists: true, data, isPass: !isFail };
  } catch {
    // Non-JSON file (e.g. markdown review) — existence = done
    return { exists: true, data: null, isPass: true };
  }
}

/**
 * Check if a gate's output file exists (regardless of content).
 * Use readGateOutput for content-aware completion checks.
 */
export function gateOutputExists(config, gate) {
  if (!gate?.output_file) return false;
  return fs.existsSync(path.join(swarmRoot(config), gate.output_file));
}

/**
 * Read the gate-status.json compatibility file.
 * For Buster this is diagnostic only, not scheduler authority.
 *
 * @returns {{ exists: boolean, data: object|null, isPass: boolean }}
 */
export function readGateStatusJson(config, gateId) {
  const gsPath = gateStatusPath(config, gateId);
  if (!fs.existsSync(gsPath)) return { exists: false, data: null, isPass: false };
  try {
    const gs = JSON.parse(fs.readFileSync(gsPath, 'utf8'));
    const s = (gs.status || '').toUpperCase();
    return { exists: true, data: gs, isPass: s === 'PASS' || s === 'OK' || s === 'APPROVED' };
  } catch {
    return { exists: true, data: null, isPass: false };
  }
}

/**
 * Read the canonical Buster gate completion signal for resume/scheduler/dependency checks.
 *
 * `output_file` is the only completion authority here. `gate-status.json` remains
 * available as a diagnostic surface, but it no longer advances scheduler truth.
 *
 * @returns {{ isPass: boolean, source: string|null, output: object, gateStatus: object }}
 */
export function readBusterGateCompletion(config, gateId, gate) {
  const output = readGateOutput(config, gate);
  if (output.isPass) {
    return {
      isPass: true,
      source: 'output_file',
      output,
      gateStatus: { exists: false, data: null, isPass: false },
    };
  }

  const gateStatus = readGateStatusJson(config, gateId);

  return {
    isPass: false,
    source: null,
    output,
    gateStatus,
  };
}
