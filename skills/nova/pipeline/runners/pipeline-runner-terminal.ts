// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';

import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { log } from '../core/logger.ts';
import { appendPipelineLifecycleEvent, loadLifecycleReadModels } from '../services/status-store.ts';
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
import { getPipelineArtifactBundle } from '../services/artifact-bundle.ts';
import { getRunId } from '../core/runtime.ts';
import { deliverFinalPreviews } from '../services/preview-delivery.ts';
import { emitPipelineCheckpoint } from '../services/pipeline-checkpoint.ts';
import {
  runMissingTerminalCompletionGenerators,
  runScheduledGenerator,
  validateTerminalCompletionGenerators,
} from './pipeline-runner-terminal-generators.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type AnyRecord = Record<string, any>;
const PROCESS_SUCCESS_CODE = 0;
const PROCESS_FAILURE_CODE = 1;
const NEEDS_NOVA_TERMINAL_STATUSES = Object.freeze(['action_required', 'timed_out']);
const ESCALATION_TERMINAL_STATUSES = Object.freeze(['action_required', 'timed_out', 'blocked']);
const NOVA_HANDOFF_UNACKNOWLEDGED_CODE = 'nova_handoff_delivery_unacknowledged';
const OBSERVABILITY_DEGRADED_CODE = 'observability_degraded';
const OBSERVABILITY_HEALTH_SCOPE_DEFAULT = 'default';
const DEGRADED_EVIDENCE_ACTION_REQUIRED = 'Resolve the degraded evidence at its source, then emit/record canonical restored or acknowledged evidence before claiming clean autonomous success.';
const TERMINAL_HALT_STATUS_MISSING = 'failed';
const OPERATOR_ALERT_REASON_MISSING = 'see previous alert';

function objectRecord(value: unknown): AnyRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : null;
}

function keySegment(value: unknown): string {
  return selectTruthyValue(() => (value === undefined), () => (value === null)) ? '' : String(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requirePipelineRunId(config: AnyRecord, purpose = 'pipeline terminal operation'): string {
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

export function loadPersistedPipelineHalt(config: AnyRecord): AnyRecord | null {
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

function buildTerminalGeneratorFailureResult(config: AnyRecord, stageId: string, result: AnyRecord): AnyRecord {
  const outputReason = typeof result?.outputs?.reason === 'string' && result.outputs.reason.trim()
    ? result.outputs.reason.trim()
    : null;
  const reason = selectDefinedValue(() => (outputReason), () => (`Terminal generator '${stageId}' failed without output reason`));
  const failureClass = typeof result?.outputs?.failure_class === 'string' && result.outputs.failure_class.trim()
    ? result.outputs.failure_class.trim()
    : typeof result?.diagnostics?.failure_class === 'string' && result.diagnostics.failure_class.trim()
      ? result.diagnostics.failure_class.trim()
      : null;
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

function normalizeDegradedEvidenceEntries(value: unknown): AnyRecord[] {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return entries
    .filter((entry): entry is AnyRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    .filter((entry) => entry.resolved !== true && entry.resolved_at == null && entry.allow_clean_success !== true);
}

function readJsonlObjects(filePath: string | null | undefined): AnyRecord[] {
  if (selectTruthyValue(() => (!filePath), () => (!fs.existsSync(filePath)))) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        const parsed = JSON.parse(line);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
      } catch (error: unknown) {
        return {
          code: 'nova_handoff_delivery_log_invalid',
          surface: 'gateway_sessions_send',
          message: error instanceof Error ? error.message : String(error),
          path: filePath,
          line: index + 1,
        };
      }
    })
    .filter((entry): entry is AnyRecord => Boolean(entry));
}

function discordReceiptPaths(config: AnyRecord): string[] {
  const artifacts = getPipelineArtifactBundle(config);
  return [
    artifacts.pipeline_dir ? path.join(artifacts.pipeline_dir, 'discord-deliveries.jsonl') : null,
    artifacts.run_log_dir ? path.join(artifacts.run_log_dir, 'discord-deliveries.jsonl') : null,
  ].filter(Boolean);
}

function requireDiscordReceiptForCleanSuccess(config: AnyRecord, progress: AnyRecord): boolean {
  return selectTruthyValue(() => (config?.evidence?.require_discord_delivery_receipt === true), () => (progress?.evidence?.require_discord_delivery_receipt === true));
}

function requiresFinalPreviewReceipt(progress: AnyRecord): boolean {
  if (!executionOrderIncludes(progress, 'gate:final-buster')) return false;
  const k8s = progress?.gates?.['final-buster']?.test_config?.k8s;
  const preview = k8s?.preview;
  return Boolean(
    k8s?.purpose === 'final-preview'
    || preview?.provider === 'tailscale-ingress'
    || k8s?.preview_exposure_provider === 'tailscale-ingress',
  );
}

function executionOrderIncludes(progress: AnyRecord, step: string): boolean {
  const order = Array.isArray(progress?.execution_order) ? progress.execution_order : [];
  return order.includes(step);
}

function collectMissingRequiredDiscordReceipt(config: AnyRecord, progress: AnyRecord): AnyRecord[] {
  if (!requireDiscordReceiptForCleanSuccess(config, progress)) return [];
  const runId = selectDefinedValue(() => (config?._runId), () => (null));
  const project = selectDefinedValue(() => (config?.project), () => (null));
  const finalPreviewReceiptRequired = requiresFinalPreviewReceipt(progress);
  const receipts = discordReceiptPaths(config).flatMap((filePath) => readJsonlObjects(filePath));
  const delivered = receipts.some((entry) => entry.run_id === runId
    && entry.project === project
    && entry.ok === true
    && entry.message_id
    && entry.channel_id
    && entry.webhook_message_returned === true
    && (!finalPreviewReceiptRequired || entry.correlation?.gate_id === 'final-buster'));
  if (delivered) return [];
  return [{
    code: finalPreviewReceiptRequired ? 'final_preview_discord_delivery_receipt_missing' : 'discord_delivery_receipt_missing',
    surface: 'discord_webhook_receipt',
    message: finalPreviewReceiptRequired
      ? 'Required final-preview Discord delivery receipt is missing for clean pipeline success'
      : 'Required Discord delivery receipt is missing for clean pipeline success',
    run_id: runId,
    project,
    ...(finalPreviewReceiptRequired ? { gate_id: 'final-buster' } : {}),
  }];
}

function collectUnacknowledgedNovaHandoffs(config: AnyRecord): AnyRecord[] {
  const artifacts = getPipelineArtifactBundle(config);
  const runId = selectDefinedValue(() => (config?._runId), () => (null));
  const paths = [
    artifacts.global_nova_injections_jsonl_path,
    artifacts.run_nova_injections_jsonl_path,
  ].filter(Boolean);
  const entries = paths.flatMap((filePath) => readJsonlObjects(filePath));
  return entries
    .filter((entry) => selectTruthyValue(() => (selectTruthyValue(() => (['nova_handoff_delivery_log_invalid'].includes(entry.code)), () => (!runId))), () => (entry.run_id === runId)))
    .filter((entry) => selectTruthyValue(() => (['nova_handoff_delivery_log_invalid'].includes(entry.code)), () => ((entry.delivery_content_known === true && entry.delivery_acknowledged !== true))))
    .map((entry) => ({
      code: selectDefinedValue(() => (entry.code), () => (NOVA_HANDOFF_UNACKNOWLEDGED_CODE)),
      surface: 'gateway_sessions_send',
      message: (selectDefinedValue(() => (entry.error), () => (`Nova session handoff was not acknowledged for ${(selectDefinedValue(() => (entry.step_type), () => ('step_type_not_emitted')))}:${(selectDefinedValue(() => (entry.step_id), () => ('step_id_not_emitted')))}`))),
      run_id: selectDefinedValue(() => (entry.run_id), () => (null)),
      step_type: selectDefinedValue(() => (entry.step_type), () => (null)),
      step_id: selectDefinedValue(() => (entry.step_id), () => (null)),
      delivery_status: (selectDefinedValue(() => (entry.delivery_status), () => (null))),
    }));
}

function observabilityEventKey(entry: AnyRecord, runId: string | null): string {
  return [
    keySegment(entry.project),
    keySegment(selectDefinedValue(() => (entry.run_id), () => (runId))),
    keySegment(entry.component),
    keySegment(entry.surface),
    keySegment(entry.reason),
    keySegment(selectDefinedValue(() => (entry.scope), () => (OBSERVABILITY_HEALTH_SCOPE_DEFAULT))),
  ].join('\x1f');
}

function collectUnresolvedObservabilityDegraded(config: AnyRecord): AnyRecord[] {
  const artifacts = getPipelineArtifactBundle(config);
  const runId = selectDefinedValue(() => (config?._runId), () => (null));
  const paths = [
    artifacts.global_pipeline_jsonl_path,
    artifacts.run_pipeline_jsonl_path,
  ].filter(Boolean);
  const entries = paths.flatMap((filePath) => readJsonlObjects(filePath));
  const unresolved = new Map<string, AnyRecord>();

  for (const entry of entries) {
    if (runId && entry.run_id && entry.run_id !== runId) continue;
    if (entry.type !== 'observability.degraded' && entry.type !== 'observability.restored') continue;
    const key = observabilityEventKey(entry, runId);
    if (entry.type === 'observability.restored') {
      unresolved.delete(key);
      continue;
    }
    unresolved.set(key, entry);
  }

  return [...unresolved.values()].map((entry) => ({
    code: selectDefinedValue(() => (entry.reason), () => (OBSERVABILITY_DEGRADED_CODE)),
    surface: (selectDefinedValue(() => ([entry.component, entry.surface].filter(Boolean).join(':')), () => ('observability'))),
    source: (selectDefinedValue(() => (entry.emitter), () => ('observability'))),
    message: (selectDefinedValue(() => (entry.detail), () => (`Observability degraded: ${(selectDefinedValue(() => (entry.component), () => ('component_not_emitted')))} ${(selectDefinedValue(() => (entry.surface), () => ('surface_not_emitted')))} ${(selectDefinedValue(() => (entry.reason), () => ('reason_not_emitted')))}`))),
    run_id: degradedEvidenceRunId(entry, runId),
    project: (selectDefinedValue(() => (entry.project), () => (null))),
    step_type: selectDefinedValue(() => (entry.step_type), () => (null)),
    step_id: selectDefinedValue(() => (entry.step_id), () => (null)),
    action_required: 'Resolve or restore this observability degradation before claiming clean autonomous pipeline success.',
  }));
}

function degradedEvidenceRunId(entry: AnyRecord, runId: string | null): string | null {
  if (typeof entry?.run_id === 'string' && entry.run_id.trim()) return entry.run_id.trim();
  return runId;
}

function collectUnresolvedDegradedEvidence(config: AnyRecord, progress: AnyRecord): AnyRecord[] {
  return [
    ...normalizeDegradedEvidenceEntries(config?._startupDegradedEvidence),
    ...normalizeDegradedEvidenceEntries(config?._degradedEvidence),
    ...normalizeDegradedEvidenceEntries(progress?._degradedEvidence),
    ...normalizeDegradedEvidenceEntries(progress?.degraded_evidence),
    ...collectUnresolvedObservabilityDegraded(config),
    ...collectMissingRequiredDiscordReceipt(config, progress),
    ...collectUnacknowledgedNovaHandoffs(config),
  ];
}

function buildDegradedEvidenceBlockedResult(config: AnyRecord, progress: AnyRecord): AnyRecord | null {
  const evidence = collectUnresolvedDegradedEvidence(config, progress);
  if (evidence.length === 0) return null;
  const reason = `Pipeline has unresolved degraded/manual fallback evidence (${evidence.length}); clean autonomous success is not allowed`;
  const degradedEvidence = evidence.map((entry) => ({
    code: selectDefinedValue(() => (selectDefinedValue(() => (entry.code), () => (entry.reason))), () => (null)),
    surface: selectDefinedValue(() => (selectDefinedValue(() => (entry.surface), () => (entry.component))), () => (null)),
    source: selectDefinedValue(() => (selectDefinedValue(() => (entry.source), () => (entry.emitter))), () => (null)),
    message: selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (entry.message), () => (entry.detail))), () => (entry.summary))), () => (null)),
    step_type: selectDefinedValue(() => (entry.step_type), () => (null)),
    step_id: selectDefinedValue(() => (entry.step_id), () => (null)),
    run_id: selectDefinedValue(() => (entry.run_id), () => (null)),
    action_required: selectDefinedValue(() => (entry.action_required), () => (DEGRADED_EVIDENCE_ACTION_REQUIRED)),
  }));
  return buildPipelineStepResult({
    stepType: PIPELINE_STEP_TYPES.PIPELINE,
    stepId: 'degraded_evidence',
    nextAction: PIPELINE_STEP_ACTIONS.HALT,
    outcome: PIPELINE_STEP_OUTCOMES.BLOCKED,
    issueType: 'environment',
    reason,
    diagnostics: {
      summary: reason,
      metadata: {
        degraded_evidence_count: evidence.length,
        degraded_evidence: degradedEvidence,
        action_required: 'Resolve every degraded evidence item through its owning canonical evidence path; do not mark the run clean while any entry remains unresolved.',
      },
    },
    correlation: {
      run_id: selectDefinedValue(() => (selectDefinedValue(() => (config?._runId), () => (config?.run_id))), () => (null)),
    },
    terminalAction: PIPELINE_TERMINAL_ACTIONS.REQUEST_HANDOFF,
    terminalScope: PIPELINE_TERMINAL_SCOPES.PIPELINE,
    terminalReasonCode: 'degraded_evidence_requires_handoff',
    terminalHumanReason: reason,
    terminalSource: 'pipeline:degraded_evidence',
  });
}

function finalizeDegradedEvidenceHaltIfNeeded(config: AnyRecord, progress: AnyRecord, opts: AnyRecord, {
  scheduleProjectSummaryOnBlocked = true,
}: AnyRecord = {}): Promise<number> | null {
  const degradedBlockedResult = buildDegradedEvidenceBlockedResult(config, progress);
  if (!degradedBlockedResult) return null;
  log('ERROR', 'Pipeline has unresolved degraded/manual fallback evidence — blocking clean completion');
  return finalizeTerminalHalt(config, progress, {
    stepType: 'pipeline',
    stepId: 'degraded_evidence',
    result: degradedBlockedResult,
    opts,
    summaryReason: 'degraded_evidence_requires_handoff',
    scheduleProjectSummaryOnBlocked,
  });
}

function buildFinalPreviewDeliveryFailureResult(config: AnyRecord, error: unknown): AnyRecord {
  const failureClass = typeof (error as AnyRecord)?.failure_class === 'string' && (error as AnyRecord).failure_class.trim()
    ? (error as AnyRecord).failure_class.trim()
    : 'final_preview_delivery_failed';
  const details = (error as AnyRecord)?.details && typeof (error as AnyRecord).details === 'object'
    ? (error as AnyRecord).details
    : {};
  return buildPipelineStepResult({
    stepType: PIPELINE_STEP_TYPES.PIPELINE,
    stepId: 'final_preview_delivery',
    nextAction: PIPELINE_STEP_ACTIONS.HALT,
    outcome: PIPELINE_STEP_OUTCOMES.ERROR,
    issueType: 'final_preview_delivery_failed',
    reason: errorMessage(error),
    diagnostics: {
      summary: errorMessage(error),
      metadata: {
        failure_class: failureClass,
        ...details,
      },
      typed: {
        failure_class: failureClass,
        ...details,
      },
    },
    correlation: {
      run_id: requirePipelineRunId(config, 'Final preview delivery failure result'),
    },
    terminalAction: PIPELINE_TERMINAL_ACTIONS.STOP,
    terminalScope: PIPELINE_TERMINAL_SCOPES.PIPELINE,
    terminalReasonCode: failureClass,
    terminalHumanReason: errorMessage(error),
    terminalSource: 'final_preview_delivery',
    terminalMetadata: {
      failure_class: failureClass,
      ...details,
    },
  });
}

export async function finalizeTerminalHalt(config: AnyRecord, progress: AnyRecord, {
  stepType,
  stepId,
  result,
  opts = {},
  summaryReason = null,
  scheduleProjectSummaryOnBlocked = false,
} : AnyRecord = {}): Promise<number> {
  const deps = getPipelineRunnerDeps(config, opts.deps);
  const ctx = { ..._telemetryCtx(config), deps: selectDefinedValue(() => (opts.deps), () => (null)) };
  const normalizedResult = normalizeStepResultForPipeline(result, { stepType, stepId });
  const stepResult = normalizedResult.stepResult;
  const terminalStatus = selectDefinedValue(() => (normalizedResult.terminalStatus), () => (TERMINAL_HALT_STATUS_MISSING));
  const terminalDecision = selectDefinedValue(() => (normalizedResult.terminalDecision), () => (null));
  const exitCode = processExitCodeForTerminalStatus(terminalStatus);
  const typedOperatorReason = (selectDefinedValue(() => (pipelineStepDiagnosticSummary(stepResult)), () => (OPERATOR_ALERT_REASON_MISSING)));
  const typedRateLimit = pipelineStepRateLimitDetails(stepResult);
  const isRateLimited = terminalStatus === 'rate_limited';
  const correlatedResult = buildResultWithStepCorrelation(config, progress, stepType, stepId, {
    terminal_status: terminalStatus,
    terminal_decision: terminalDecision,
    step_type: stepResult.stepType,
    step_id: stepResult.stepId,
    outcome: stepResult.outcome,
    next_action: stepResult.nextAction,
    ...(stepResult.issueType ? { issue_type: stepResult.issueType } : {}),
    reason: typedOperatorReason,
    ...(selectDefinedValue(() => (objectRecord(stepResult.diagnostics?.metadata)), () => ({}))),
    ...(selectDefinedValue(() => (objectRecord(stepResult.correlation)), () => ({}))),
    ...(isRateLimited ? {
      rate_limit_authority: typedRateLimit.source,
      rate_limit_exhausted: typedRateLimit.rate_limit_exhausted,
      max_rate_limit_pauses: typedRateLimit.max_rate_limit_pauses,
      rate_limit_status: typedRateLimit.rate_limit_status,
    } : {}),
  }, deps);
  const gateType = resolvePipelineGateType(progress, stepType, stepId, correlatedResult);
  const maxRateLimitPauses = isRateLimited ? typedRateLimit.max_rate_limit_pauses : null;
  const rateLimitExhausted = isRateLimited ? typedRateLimit.rate_limit_exhausted : false;
  const haltReason = (selectDefinedValue(() => (terminalDecision?.reasonCode), () => ('failed')));
  const operatorReason = typedOperatorReason;
  const resolvedSummaryReason = selectDefinedValue(() => (summaryReason), () => (`terminal_halt:${haltReason}:${stepId}`));

  appendPipelineLifecycleEvent(config, 'pipeline_run.halted', {
    progress,
    result: correlatedResult,
    stepType,
    stepId,
    haltReason: String(haltReason).toLowerCase(),
  });

  await emitOperatorAlert(ctx, 'pipeline.operator_alert', {
    module_id: stepType === 'module' ? stepId : null,
    gate_id: stepType === 'gate' ? stepId : null,
    gate_type: gateType,
    step_type: stepType,
    attempt: resolveResultAttempt(correlatedResult),
    dispatch_id: resolveResultDispatchId(correlatedResult),
    gateway_label: resolveResultGatewayLabel(correlatedResult),
    session_key: resolveResultSessionKey(correlatedResult),
    terminal_status: terminalStatus,
    terminal_decision: terminalDecision,
    reason: operatorReason,
    ...(isRateLimited ? {
      rate_limit_exhausted: rateLimitExhausted,
      max_rate_limit_pauses: maxRateLimitPauses,
    } : {}),
  }, {
    hookId: 'pipeline.completed',
    presentation: {
      discord: {
        level: 'CRITICAL',
        title: `Pipeline halted: ${config.project}`,
        description: `Pipeline stopped at ${stepType} '${stepId}'. Status: ${terminalStatus}.`,
        fields: [
          ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, { run_id: requirePipelineRunId(config, 'Pipeline halt Discord identity'), module_id: stepType === 'module' ? stepId : null, gate_id: stepType === 'gate' ? stepId : null, gate_type: gateType, step_type: stepType, attempt: resolveResultAttempt(correlatedResult), dispatch_id: resolveResultDispatchId(correlatedResult), gateway_label: resolveResultGatewayLabel(correlatedResult), session_key: resolveResultSessionKey(correlatedResult) }),
          { name: 'Stopped At', value: `${stepType}:${stepId}` },
          { name: 'Status', value: String(terminalStatus) },
          { name: 'Reason', value: String(operatorReason).slice(0, 200) },
          ...(isRateLimited && maxRateLimitPauses != null ? [{ name: 'Rate Limit Pauses', value: String(maxRateLimitPauses) }] : []),
          { name: 'Action', value: terminalStatus === 'blocked' ? 'Fix manually, then --resume' : 'Inspect terminal failure evidence before rerun' },
        ],
      },
    },
  });

  if (shouldInjectNeedsNovaForTerminalStatus(terminalStatus)) {
    await deps.injectNeedsNova(config, correlatedResult, opts.novaChannel, stepType, stepId);
  }
  if (shouldEmitEscalationForTerminalStatus(terminalStatus)) {
    onEscalated(ctx, stepType, stepId, {
      ...buildEscalationPayload(stepType, stepId, correlatedResult, haltReason, gateType),
    });
  }
  deps.output({ exit: exitCode, ...correlatedResult });
  onPipelineHalted(ctx, buildPipelineHaltPayload(stepType, stepId, correlatedResult, haltReason, gateType));
  emitPipelineSummaryLifecycle(config, ctx, terminalStatus, resolvedSummaryReason, progress, deps.writeSummary, terminalDecision);

  if (scheduleProjectSummaryOnBlocked && terminalStatus === 'blocked') {
    await runScheduledGenerator(config, progress, 'generator:project_summary', {
      scheduleReason: 'blocked_terminal_halt',
      mode: 'full',
      ...(stepType === 'module' ? { moduleId: stepId } : {}),
      ...(stepType === 'gate' ? { gateId: stepId } : {}),
      terminalStatus,
      reasonCode: resolvedSummaryReason,
      orderIndex: 1,
      causationRef: 'event:pipeline_run.halted',
    });
  }
  return exitCode;
}

export async function completePipeline(config: AnyRecord, progress: AnyRecord, opts: AnyRecord = {}): Promise<number> {
  const deps = getPipelineRunnerDeps(config, opts.deps);
  const persistedHaltExitCode = emitPersistedPipelineHalt(config, deps);
  if (persistedHaltExitCode !== null) return persistedHaltExitCode;

  const ctx = _telemetryCtx(config);
  const priorPipelineState = selectDefinedValue(() => (loadLifecycleReadModels(config)?.pipeline), () => (null));
  const runId = requirePipelineRunId(config, 'Pipeline completion');
  if (priorPipelineState?.run_id === runId && priorPipelineState?.status === 'COMPLETED') {
    log('INFO', `Pipeline run '${priorPipelineState.run_id}' already completed — repairing terminal artifacts and checking terminal generators`);
    emitPipelineSummaryLifecycle(config, ctx, 'succeeded', 'PIPELINE_COMPLETE', progress, deps.writeSummary);
    await runMissingTerminalCompletionGenerators(config, progress, opts);
    await onPipelineCompleted(ctx, 'succeeded', undefined, {}, {});
    return PROCESS_SUCCESS_CODE;
  }

  const completionFields = buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, { run_id: runId });
  const unavailableTerminalGenerator = validateTerminalCompletionGenerators(config, progress);
  if (unavailableTerminalGenerator) {
    log('ERROR', `Terminal generator '${unavailableTerminalGenerator.stageId}' unavailable — pipeline halted before clean completion`);
    return finalizeTerminalHalt(config, progress, {
      stepType: 'generator',
      stepId: unavailableTerminalGenerator.stageId,
      result: buildTerminalGeneratorFailureResult(config, unavailableTerminalGenerator.stageId, unavailableTerminalGenerator.result),
      opts,
      summaryReason: 'terminal_generator_failed',
    });
  }
  if (executionOrderIncludes(progress, 'gate:final-buster')) {
    try {
      await deliverFinalPreviews(config, progress, { discord: deps.discord, deps: opts.deps });
    } catch (error) {
      log('ERROR', `Final preview delivery failed: ${errorMessage(error)}`);
      return finalizeTerminalHalt(config, progress, {
        stepType: 'pipeline',
        stepId: 'final_preview_delivery',
        result: buildFinalPreviewDeliveryFailureResult(config, error),
        opts,
        summaryReason: 'final_preview_delivery_failed',
        scheduleProjectSummaryOnBlocked: true,
      });
    }
  }
  const preCompletionDegradedHalt = finalizeDegradedEvidenceHaltIfNeeded(config, progress, opts);
  if (preCompletionDegradedHalt) return preCompletionDegradedHalt;
  emitPipelineCheckpoint(config, 'after_final_review_before_summary', {
    step_type: 'pipeline',
    step_id: 'pipeline_complete',
  });
  emitPipelineSummaryLifecycle(config, ctx, 'succeeded', 'PIPELINE_COMPLETE', progress, deps.writeSummary);
  const failedTerminalGenerator = await runMissingTerminalCompletionGenerators(config, progress, opts);
  if (failedTerminalGenerator) {
    log('ERROR', `Terminal generator '${failedTerminalGenerator.stageId}' failed before clean completion`);
    return finalizeTerminalHalt(config, progress, {
      stepType: 'generator',
      stepId: failedTerminalGenerator.stageId,
      result: buildTerminalGeneratorFailureResult(config, failedTerminalGenerator.stageId, failedTerminalGenerator.result),
      opts,
      summaryReason: 'terminal_generator_failed',
    });
  }
  await onPipelineCompleted(ctx, 'succeeded', undefined, {}, {
    presentation: {
      discord: {
        level: 'OK',
        title: `Pipeline Complete: ${config.project}`,
        description: 'All modules passed!',
        fields: completionFields,
      },
    },
  });
  const postCompletionNotificationDegradedHalt = finalizeDegradedEvidenceHaltIfNeeded(config, progress, opts, {
    scheduleProjectSummaryOnBlocked: false,
  });
  if (postCompletionNotificationDegradedHalt) return postCompletionNotificationDegradedHalt;
  try {
    appendPipelineLifecycleEvent(config, 'pipeline_run.completed', {
      progress,
      result: { terminal_status: 'succeeded', reason: 'PIPELINE_COMPLETE' },
    });
  } catch (error) {
    if (!errorMessage(error).includes('is already terminal')) throw error;
    log('INFO', `Pipeline run '${runId}' already terminal — checking terminal generators`);
    await runMissingTerminalCompletionGenerators(config, progress, opts);
    return PROCESS_SUCCESS_CODE;
  }
  log('OK', '🎉 Pipeline complete — all modules and gates PASS');
  deps.output({ exit: PROCESS_SUCCESS_CODE, status: 'PIPELINE_COMPLETE' });
  return PROCESS_SUCCESS_CODE;
}

export async function haltPipeline(config: AnyRecord, progress: AnyRecord, next: AnyRecord, result: AnyRecord | null, opts: AnyRecord = {}): Promise<number> {
  if (next.type === 'blocked') {
    const deps = getPipelineRunnerDeps(config, opts.deps);
    const blockedResult = buildBlockedModuleResult(config, progress, next.id, deps);
    log('ERROR', `Module ${next.id} is BLOCKED — pipeline halted`);
    return finalizeTerminalHalt(config, progress, {
      stepType: 'module',
      stepId: next.id,
      result: blockedResult,
      opts,
      scheduleProjectSummaryOnBlocked: true,
    });
  }

  return finalizeTerminalHalt(config, progress, {
    stepType: next.type,
    stepId: next.id,
    result,
    opts,
    scheduleProjectSummaryOnBlocked: true,
  });
}
