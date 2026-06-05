import { getActiveContext } from '../../core/logger.ts';
import { getRunId } from '../../core/runtime.ts';
import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
} from '../correlation.ts';

export function getActiveProgress(config) {
  return getActiveContext()?.progress || config?._progress || null;
}

export function resolveModuleConfig(progress, moduleId, dir) {
  if (!progress?.modules) return null;
  if (moduleId && progress.modules[moduleId]) return progress.modules[moduleId];
  return Object.values(progress.modules).find((mod) => mod?.dir === dir) || null;
}

export function resolveModuleAttempt(status, mutation = {}, currentModuleState = null) {
  if (mutation?.attempt != null) return mutation.attempt;
  if (status?.active_agent?.attempt != null) return Number(status.active_agent.attempt);
  const terminalStatus = mutation?.newStatus === 'FAIL' || mutation?.newStatus === 'BLOCKED';
  const failCount = Number(status?.fail_count || 0);
  const heuristicAttempt = terminalStatus
    ? Math.max(1, failCount || 1)
    : Math.max(1, failCount + 1);
  const currentAttempt = Number(currentModuleState?.current_attempt || 0);

  if (terminalStatus && currentAttempt >= heuristicAttempt) return currentAttempt;
  if (currentAttempt > heuristicAttempt) return currentAttempt;
  return heuristicAttempt;
}

export function resolveModuleCommit(status) {
  return status?.commit_hash
    || status?.forge_commit_hash
    || status?.buster_commit_hash
    || status?.forge_commit
    || status?.buster_commit
    || null;
}

export function buildPipelineRefs(config) {
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
    dispatch_id: status?.active_agent?.dispatch_id || resolveStatusDispatchId(status) || null,
    gateway_label: status?.active_agent?.gateway_label || resolveStatusGatewayLabel(status) || null,
    session_key: status?.active_agent?.session_key || resolveStatusSessionKey(status) || null,
    model: status?.active_agent?.model || status?.model || null,
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

export function buildWaitRefs(config, {
  gateId,
  gateType = 'approval',
  attempt = 1,
  waitKind = 'approval',
} = {}) {
  const gateRefs = buildGateEvaluationRefs(config, { gateId, gateType, attempt });
  const waitAttemptSegment = Number(gateRefs.attempt || 1) > 1 ? `:${gateRefs.attempt}` : '';
  const waitRef = gateRefs.run_id && gateId
    ? `wait:${gateRefs.run_id}:gate:${gateId}${waitAttemptSegment}:${waitKind}`
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
  const signalAttemptSegment = Number(waitRefs.attempt || 1) > 1 ? `:${waitRefs.attempt}` : '';
  const resumeSignalRef = waitRefs.run_id && gateId && signalKind
    ? `resume_signal:${waitRefs.run_id}:gate:${gateId}${signalAttemptSegment}:${waitKind}:${signalKind}`
    : null;
  return {
    ...waitRefs,
    primary_ref: { kind: 'resume_signal', id: resumeSignalRef },
    signal_kind: signalKind || null,
    resume_signal_ref: resumeSignalRef,
  };
}

export function buildCooldownRefs(config, {
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
