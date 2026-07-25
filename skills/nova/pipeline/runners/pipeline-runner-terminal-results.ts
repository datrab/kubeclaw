import {
  onPipelineCompleted,
  onPipelineHalted,
  onSummaryStarted,
  onSummaryCompleted,
  onEscalated,
  emitOperatorAlert,
} from '../services/telemetry.ts';
import {
  resolveResultAttempt,
  resolveResultSessionKey,
  resolveResultGatewayLabel,
  resolveResultDispatchId,
} from '../services/correlation.ts';
import {
  buildPipelineStepResult,
  isPipelineStepResult,
  pipelineStepDiagnosticSummary,
  pipelineStepRateLimitDetails,
  pipelineStepTerminalDecision,
  pipelineStepTerminalStatus,
  PIPELINE_STEP_ACTIONS,
  PIPELINE_STEP_OUTCOMES,
  PIPELINE_STEP_TYPES,
} from '../services/contracts/pipeline-step-result.ts';
import {
  PIPELINE_TERMINAL_ACTIONS,
  PIPELINE_TERMINAL_SCOPES,
} from '../services/contracts/terminal-decision.ts';
import {
  _telemetryCtx,
  buildEscalationPayload,
  buildPipelineHaltPayload,
  buildBlockedModuleResult,
  buildResultWithStepCorrelation,
  resolvePipelineGateType,
} from './pipeline-runner-shared.ts';
import { getPipelineRunnerDeps } from './pipeline-runner-deps.ts';
import { getRunId } from '../core/runtime.ts';
import { getPipelineArtifactBundle } from '../services/artifact-bundle.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type AnyRecord = Record<string, any>;
const PROCESS_SUCCESS_CODE = 0;
const PROCESS_FAILURE_CODE = 1;
const NEEDS_NOVA_TERMINAL_STATUSES = Object.freeze(['action_required', 'timed_out']);
const ESCALATION_TERMINAL_STATUSES = Object.freeze(['action_required', 'timed_out', 'blocked']);

function objectRecord(value: unknown): AnyRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requirePipelineRunId(config: AnyRecord, purpose: any = 'pipeline terminal operation'): string {
  const runId = getRunId(config);
  if (runId) return runId;
  throw new Error(`${purpose} requires a run id`);
}

function shouldInjectNeedsNovaForTerminalStatus(terminalStatus: string | null | undefined): boolean {
  return terminalStatus != null && NEEDS_NOVA_TERMINAL_STATUSES.includes(terminalStatus);
}

function shouldEmitEscalationForTerminalStatus(terminalStatus: string | null | undefined): boolean {
  return terminalStatus != null && ESCALATION_TERMINAL_STATUSES.includes(terminalStatus);
}

export function processExitCodeForTerminalStatus(terminalStatus: string | null | undefined): number {
  return terminalStatus === 'succeeded' ? PROCESS_SUCCESS_CODE : PROCESS_FAILURE_CODE;
}

function loadPersistedPipelineHalt(config: AnyRecord): AnyRecord | null {
  const runId = requirePipelineRunId(config, 'Persisted pipeline halt lookup');
  const pipeline = selectDefinedValue(() => (loadLifecycleReadModels(config)?.pipeline), () => (null));
  if (selectTruthyValue(() => (selectTruthyValue(() => (!pipeline), () => (pipeline.run_id !== runId))), () => (pipeline.status !== 'HALTED'))) return null;
  if (!pipeline.terminal_status) {
    throw new Error(`Persisted pipeline halt for run '${runId}' is missing terminal_status`);
  }
  if (!pipeline.halt_reason) {
    throw new Error(`Persisted pipeline halt for run '${runId}' is missing halt_reason`);
  }
  if (selectTruthyValue(() => (!pipeline.step_type), () => (!pipeline.step_id))) {
    throw new Error(`Persisted pipeline halt for run '${runId}' is missing step identity`);
  }
  return {
    run_id: runId,
    terminal_status: pipeline.terminal_status,
    terminal_decision: selectDefinedValue(() => (pipeline.terminal_decision), () => (null)),
    halt_reason: pipeline.halt_reason,
    step_type: pipeline.step_type,
    step_id: pipeline.step_id,
  };
}

export function emitPersistedPipelineHalt(config: AnyRecord, deps: AnyRecord = {}): number | null {
  const halt = loadPersistedPipelineHalt(config);
  if (!halt) return null;
  const exitCode = processExitCodeForTerminalStatus(halt.terminal_status);
  deps.output?.({
    exit: exitCode,
    terminal_status: halt.terminal_status,
    terminal_decision: halt.terminal_decision,
    reason: halt.halt_reason,
    step_type: halt.step_type,
    step_id: halt.step_id,
    run_id: halt.run_id,
    halted_existing: true,
  });
  return exitCode;
}

function buildInvalidPipelineStepResult(result: AnyRecord, { stepType = PIPELINE_STEP_TYPES.PIPELINE, stepId = 'missing_step_id' }: AnyRecord = {}): AnyRecord {
  const normalizedStepType = Object.values(PIPELINE_STEP_TYPES).includes(stepType)
    ? stepType
    : PIPELINE_STEP_TYPES.PIPELINE;
  const normalizedStepId = stepId == null ? 'missing_step_id' : String(stepId);
  const reason = `Invalid ${normalizedStepType} step result for '${normalizedStepId}': expected pipeline_step_result`;
  const resultKeys = result && typeof result === 'object' ? Object.keys(result).slice(0, 12) : [];
  return buildPipelineStepResult({
    stepType: normalizedStepType,
    stepId: normalizedStepId,
    nextAction: PIPELINE_STEP_ACTIONS.HALT,
    outcome: PIPELINE_STEP_OUTCOMES.ERROR,
    issueType: 'environment',
    reason,
    diagnostics: {
      summary: reason,
      metadata: {
        invalid_step_result_rejected: true,
        rejected_result_kind: selectDefinedValue(() => (result?.kind), () => (null)),
        rejected_result_keys: resultKeys,
      },
    },
    correlation: {
      step_type: normalizedStepType,
      step_id: normalizedStepId,
    },
    terminalAction: PIPELINE_TERMINAL_ACTIONS.STOP,
    terminalScope: normalizedStepType,
  });
}

export function normalizeStepResultForPipeline(result: AnyRecord = {}, step: AnyRecord = {}): AnyRecord {
  if (isPipelineStepResult(result)) {
    return {
      stepResult: result,
      terminalStatus: pipelineStepTerminalStatus(result),
      terminalDecision: pipelineStepTerminalDecision(result),
      shouldContinue: result.nextAction === 'continue',
    };
  }
  const invalidStepResult = buildInvalidPipelineStepResult(result, step);
  return {
    stepResult: invalidStepResult,
    terminalStatus: pipelineStepTerminalStatus(invalidStepResult),
    terminalDecision: pipelineStepTerminalDecision(invalidStepResult),
    shouldContinue: false,
  };
}

export function emitPipelineSummaryLifecycle(config: AnyRecord, ctx: AnyRecord, terminalStatus: string, reasonCode: string, progress: AnyRecord, writeSummaryFn: (...args: any[]) => AnyRecord, terminalDecision: AnyRecord | null = null): AnyRecord {
  const baseData = {
    output_dir: getPipelineArtifactBundle(config).pipeline_dir,
    terminal_status: selectDefinedValue(() => (terminalStatus), () => (null)),
    terminal_decision: selectDefinedValue(() => (terminalDecision), () => (null)),
    reason_code: selectDefinedValue(() => (reasonCode), () => (null)),
  };
  onSummaryStarted(ctx, 'pipeline', baseData);
  const summaryResult = objectRecord(writeSummaryFn(config, terminalStatus, reasonCode, ctx, progress, terminalDecision));
  if (!summaryResult) throw new TypeError('Pipeline summary writer must return an object');
  const { failed: summaryFailed, ...summaryTelemetryFields } = summaryResult;
  const completionData: AnyRecord = {
    ...baseData,
    ...summaryTelemetryFields,
    status: summaryFailed ? 'failed' : (terminalStatus === 'succeeded' ? 'ok' : 'failed'),
  };
  if (summaryFailed && !completionData.reason) {
    completionData.reason = 'Failed to write pipeline summary';
  }
  onSummaryCompleted(ctx, 'pipeline', completionData);
  return summaryResult;
}

function trimmedText(value: any): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function terminalGeneratorFailureClass(result: AnyRecord): string | null {
  return trimmedText(result?.outputs?.failure_class) ?? trimmedText(result?.diagnostics?.failure_class);
}

export function buildTerminalGeneratorFailureResult(config: AnyRecord, stageId: string, result: AnyRecord): AnyRecord {
  const reason = trimmedText(result?.outputs?.reason) ?? `Terminal generator '${stageId}' failed without output reason`;
  const failureClass = terminalGeneratorFailureClass(result);
  const isTimeout = failureClass === 'timeout';
  return buildPipelineStepResult({
    stepType: 'generator',
    stepId: stageId,
    nextAction: PIPELINE_STEP_ACTIONS.HALT,
    outcome: isTimeout ? PIPELINE_STEP_OUTCOMES.TIMEOUT : PIPELINE_STEP_OUTCOMES.ERROR,
    issueType: 'configuration',
    reason,
    diagnostics: {
      summary: reason,
      metadata: {
        terminal_generator_failed: true,
        ...(failureClass ? { failure_class: failureClass } : {}),
        generator_result: result,
      },
      ...(result?.diagnostics?.contract_invalid === true ? { contract_invalid: true } : {}),
      ...(result?.diagnostics?.contract_diagnostic ? { contract_diagnostic: result.diagnostics.contract_diagnostic } : {}),
    },
    correlation: {
      run_id: selectDefinedValue(() => (selectDefinedValue(() => (config?._runId), () => (config?.run_id))), () => (null)),
      step_type: 'generator',
      step_id: stageId,
    },
    terminalAction: isTimeout ? PIPELINE_TERMINAL_ACTIONS.REQUEST_HANDOFF : PIPELINE_TERMINAL_ACTIONS.STOP,
    terminalScope: PIPELINE_TERMINAL_SCOPES.PIPELINE,
    terminalReasonCode: failureClass,
    terminalHumanReason: reason,
    terminalSource: `pipeline:${stageId}`,
  });
}

import { log } from '../core/logger.ts';
import { appendPipelineLifecycleEvent, loadLifecycleReadModels } from '../services/status-store.ts';
