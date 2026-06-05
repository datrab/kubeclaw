import { createOpaqueId } from '../../core/runtime.ts';
import { appendJsonLine, lifecycleEventsPath, withLifecycleAppendLock } from './storage.ts';
import { buildLifecycleIdempotencyKey } from './idempotency.ts';
import { getPipelineArtifactBundle } from '../artifact-bundle.ts';
import {
  buildCooldownRefs,
  buildGateEvaluationRefs,
  buildModuleAttemptRefs,
  buildPipelineRefs,
  buildResumeSignalRefs,
  buildWaitRefs,
  getActiveProgress,
  resolveModuleAttempt,
  resolveModuleCommit,
  resolveModuleConfig,
} from './refs.ts';
import {
  createDefaultLifecycleReadModels,
  loadLifecycleReadModels,
  readLifecycleEvents,
  rebuildLifecycleReadModels,
  saveLifecycleReadModels,
} from './read-models.ts';
import { ensureLifecycleEventLegal } from './legality.ts';
import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
} from '../correlation.ts';
import { normalizeFailureClass } from '../failure-semantics.ts';
import { cloneSerializable } from '../serialization.ts';
const LIFECYCLE_READ_MODELS_VERSION = 'v1';

export function appendLifecycleEvent(config, proposal = {}) {
  if (!proposal?.type) throw new Error('appendLifecycleEvent requires type');
  if (!proposal?.refs?.primary_ref?.id) throw new Error('appendLifecycleEvent requires refs.primary_ref.id');
  return withLifecycleAppendLock(config, () => {
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
    const nextReadModels = saveLifecycleReadModels(config, rebuildLifecycleReadModels(config));
    return { record: event, deduped: false, readModels: nextReadModels };
  });
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
    fallback_model: config?.fallback_model || null,
    models: cloneSerializable(progress?.defaults?.models || null),
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
    const readModels = loadLifecycleReadModels(config), artifacts = getPipelineArtifactBundle(config);
    data = {
      exit_code: result?.exit ?? 0,
      exit_reason: result?.reason || 'PIPELINE_COMPLETE',
      duration_seconds: null,
      modules_passed: readModels?.progression?.modules_passed ?? null,
      modules_failed: readModels?.progression?.modules_failed ?? null,
      modules_blocked: readModels?.progression?.modules_blocked ?? null,
      modules_total: readModels?.progression?.modules_total ?? null,
      total_cost_usd: null,
      summary_json_path: artifacts.run_summary_path,
      pipeline_summary_path: artifacts.pipeline_summary_path,
      latest_json_path: artifacts.latest_json_path,
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
        summary: status?.completion_summary || mutation.completionSummary || mutation.note || null,
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
