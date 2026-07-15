import { getActiveContext } from '../../core/logger.ts';
import { getRunId } from '../../core/runtime.ts';
import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
} from '../correlation.ts';
import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
const FIRST_ATTEMPT = 1;

function numericValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveAttempt(value) {
  return Math.max(FIRST_ATTEMPT, numericValue(value, FIRST_ATTEMPT));
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function requiredText(value, label) {
  const text = firstText(value);
  if (!text) throw new Error(`${label} is required for lifecycle refs`);
  return text;
}

export function getActiveProgress(config) {
  return selectTruthyValue(() => (selectTruthyValue(() => (getActiveContext()?.progress), () => (config?._progress))), () => (null));
}

export function resolveModuleConfig(progress, moduleId, dir) {
  if (!progress?.modules) return null;
  if (moduleId && progress.modules[moduleId]) return progress.modules[moduleId];
  return selectTruthyValue(() => (Object.values(progress.modules).find((mod) => mod?.dir === dir)), () => (null));
}

export function resolveModuleAttempt(status, mutation = {}, currentModuleState = null) {
  if (mutation?.attempt != null) return mutation.attempt;
  if (status?.active_agent?.attempt != null) return Number(status.active_agent.attempt);
  const terminalStatus = ['FAIL', 'BLOCKED'].includes(mutation?.newStatus);
  const failCount = numericValue(status?.fail_count, 0);
  const heuristicAttempt = terminalStatus
    ? positiveAttempt(failCount)
    : positiveAttempt(failCount + 1);
  const currentAttempt = numericValue(currentModuleState?.current_attempt, 0);

  if (terminalStatus && currentAttempt >= heuristicAttempt) return currentAttempt;
  if (currentAttempt > heuristicAttempt) return currentAttempt;
  return heuristicAttempt;
}

export function resolveModuleCommit(status) {
  return firstText(
    status?.commit_hash,
    status?.forge_commit_hash,
    status?.buster_commit_hash,
    status?.forge_commit,
    status?.buster_commit,
  );
}

export function buildPipelineRefs(config) {
  const runId = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (config?._runId), () => (config?.run_id))), () => (getRunId(config)))), () => (null));
  const runRef = runId ? `run:${runId}` : null;
  const project = firstText(config?.project);
  return {
    primary_ref: { kind: 'pipeline_run', id: runRef },
    run_id: runId,
    run_ref: runRef,
    project,
  };
}

export function buildModuleAttemptRefs(config, status, dir, mutation = {}, currentModuleState = null) {
  const moduleId = requiredText(status?.module_id, 'module_id');
  const attempt = resolveModuleAttempt(status, mutation, currentModuleState);
  const runId = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (config?._runId), () => (config?.run_id))), () => (getRunId(config)))), () => (null));
  const runRef = runId ? `run:${runId}` : null;
  const project = firstText(config?.project);
  const moduleRef = moduleId ? `module:${moduleId}` : null;
  const moduleAttemptRef = runId && moduleId && attempt ? `module_attempt:${runId}:${moduleId}:${attempt}` : null;
  return {
    primary_ref: { kind: 'module_attempt', id: moduleAttemptRef },
    run_id: runId,
    run_ref: runRef,
    project,
    module_id: moduleId,
    module_ref: moduleRef,
    attempt,
    module_attempt_ref: moduleAttemptRef,
    dispatch_id: selectTruthyValue(() => (selectTruthyValue(() => (status?.active_agent?.dispatch_id), () => (resolveStatusDispatchId(status)))), () => (null)),
    gateway_label: selectTruthyValue(() => (selectTruthyValue(() => (status?.active_agent?.gateway_label), () => (resolveStatusGatewayLabel(status)))), () => (null)),
    session_key: selectTruthyValue(() => (selectTruthyValue(() => (status?.active_agent?.session_key), () => (resolveStatusSessionKey(status)))), () => (null)),
    model: selectTruthyValue(() => (selectTruthyValue(() => (status?.active_agent?.model), () => (status?.model))), () => (null)),
  };
}

export function buildGateEvaluationRefs(config, {
  gateId,
  gateType = 'approval',
  attempt = 1,
} = {}) {
  const resolvedAttempt = positiveAttempt(attempt);
  const runId = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (config?._runId), () => (config?.run_id))), () => (getRunId(config)))), () => (null));
  const runRef = runId ? `run:${runId}` : null;
  const project = firstText(config?.project);
  const gateRef = gateId ? `gate:${gateId}` : null;
  const gateEvaluationRef = runId && gateId
    ? `gate_evaluation:${runId}:${gateId}:${resolvedAttempt}`
    : null;

  return {
    primary_ref: { kind: 'gate_evaluation', id: gateEvaluationRef },
    run_id: runId,
    run_ref: runRef,
    project,
    gate_id: selectTruthyValue(() => (gateId), () => (null)),
    gate_ref: gateRef,
    gate_type: selectTruthyValue(() => (gateType), () => (null)),
    attempt: resolvedAttempt,
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
  const waitAttemptSegment = positiveAttempt(gateRefs.attempt) > FIRST_ATTEMPT ? `:${gateRefs.attempt}` : '';
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
  const signalAttemptSegment = positiveAttempt(waitRefs.attempt) > FIRST_ATTEMPT ? `:${waitRefs.attempt}` : '';
  const resumeSignalRef = waitRefs.run_id && gateId && signalKind
    ? `resume_signal:${waitRefs.run_id}:gate:${gateId}${signalAttemptSegment}:${waitKind}:${signalKind}`
    : null;
  return {
    ...waitRefs,
    primary_ref: { kind: 'resume_signal', id: resumeSignalRef },
    signal_kind: selectTruthyValue(() => (signalKind), () => (null)),
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
    const runId = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (config?._runId), () => (config?.run_id))), () => (getRunId(config)))), () => (null));
    const resolvedAttempt = positiveAttempt(attempt);
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
      gateType: selectTruthyValue(() => (gateType), () => (null)),
      attempt: positiveAttempt(attempt),
    });
  }

  throw new Error('buildCooldownRefs requires moduleId or gateId');
}
