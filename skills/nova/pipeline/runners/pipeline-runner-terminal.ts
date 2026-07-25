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
import { buildDegradedEvidenceBlockedResult } from './pipeline-runner-degraded-evidence.ts';
import { buildTerminalGeneratorFailureResult, emitPipelineSummaryLifecycle, emitPersistedPipelineHalt, normalizeStepResultForPipeline, processExitCodeForTerminalStatus } from './pipeline-runner-terminal-results.ts';
import { finalizeTerminalHalt } from './pipeline-runner-terminal-halt.ts';
export { emitPipelineSummaryLifecycle, emitPersistedPipelineHalt, normalizeStepResultForPipeline, processExitCodeForTerminalStatus } from './pipeline-runner-terminal-results.ts';
export { finalizeTerminalHalt } from './pipeline-runner-terminal-halt.ts';
type AnyRecord = Record<string, any>;
const PROCESS_SUCCESS_CODE = 0;
const PROCESS_FAILURE_CODE = 1;
const NEEDS_NOVA_TERMINAL_STATUSES = Object.freeze(['action_required', 'timed_out']);
const ESCALATION_TERMINAL_STATUSES = Object.freeze(['action_required', 'timed_out', 'blocked']);
const TERMINAL_HALT_STATUS_MISSING = 'failed';
const OPERATOR_ALERT_REASON_MISSING = 'see previous alert';

function executionOrderIncludes(progress: AnyRecord, step: string): boolean {
  const order = Array.isArray(progress?.execution_order) ? progress.execution_order : [];
  return order.includes(step);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requirePipelineRunId(config: AnyRecord, purpose: string): string {
  const runId = getRunId(config);
  if (!runId) throw new Error(`${purpose} requires a run id`);
  return runId;
}

function finalizeDegradedEvidenceHaltIfNeeded(config: AnyRecord, progress: AnyRecord, opts: AnyRecord, { scheduleProjectSummaryOnBlocked = true }: AnyRecord = {}): Promise<number> | null {
  const result = buildDegradedEvidenceBlockedResult(config, progress);
  if (!result) return null;
  log('ERROR', 'Pipeline has unresolved degraded/manual fallback evidence — blocking clean completion');
  return finalizeTerminalHalt(config, progress, { stepType: 'pipeline', stepId: 'degraded_evidence', result, opts, summaryReason: 'degraded_evidence_requires_handoff', scheduleProjectSummaryOnBlocked });
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

async function repairCompletedPipeline(
  config: AnyRecord,
  progress: AnyRecord,
  opts: AnyRecord,
  deps: AnyRecord,
  ctx: AnyRecord,
  priorPipelineState: AnyRecord | null,
  runId: string,
): Promise<number | null> {
  if (priorPipelineState?.run_id !== runId || priorPipelineState?.status !== 'COMPLETED') return null;
  log('INFO', `Pipeline run '${priorPipelineState.run_id}' already completed — repairing terminal artifacts and checking terminal generators`);
  emitPipelineSummaryLifecycle(config, ctx, 'succeeded', 'PIPELINE_COMPLETE', progress, deps.writeSummary);
  await runMissingTerminalCompletionGenerators(config, progress, opts);
  await onPipelineCompleted(ctx, 'succeeded', undefined, {}, {});
  return PROCESS_SUCCESS_CODE;
}

function haltUnavailableTerminalGenerator(
  config: AnyRecord,
  progress: AnyRecord,
  opts: AnyRecord,
): Promise<number> | null {
  const unavailable = validateTerminalCompletionGenerators(config, progress);
  if (!unavailable) return null;
  log('ERROR', `Terminal generator '${unavailable.stageId}' unavailable — pipeline halted before clean completion`);
  return finalizeTerminalHalt(config, progress, {
    stepType: 'generator',
    stepId: unavailable.stageId,
    result: buildTerminalGeneratorFailureResult(config, unavailable.stageId, unavailable.result),
    opts,
    summaryReason: 'terminal_generator_failed',
  });
}

async function deliverFinalPreviewOrHalt(
  config: AnyRecord,
  progress: AnyRecord,
  opts: AnyRecord,
  deps: AnyRecord,
): Promise<number | null> {
  if (!executionOrderIncludes(progress, 'gate:final-buster')) return null;
  try {
    await deliverFinalPreviews(config, progress, { discord: deps.discord, deps: opts.deps });
    return null;
  } catch (error: unknown) {
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

async function runTerminalGeneratorsOrHalt(
  config: AnyRecord,
  progress: AnyRecord,
  opts: AnyRecord,
): Promise<number | null> {
  const failed = await runMissingTerminalCompletionGenerators(config, progress, opts);
  if (!failed) return null;
  log('ERROR', `Terminal generator '${failed.stageId}' failed before clean completion`);
  return finalizeTerminalHalt(config, progress, {
    stepType: 'generator',
    stepId: failed.stageId,
    result: buildTerminalGeneratorFailureResult(config, failed.stageId, failed.result),
    opts,
    summaryReason: 'terminal_generator_failed',
  });
}

async function recordSuccessfulPipelineCompletion(
  config: AnyRecord,
  progress: AnyRecord,
  opts: AnyRecord,
  deps: AnyRecord,
  ctx: AnyRecord,
  runId: string,
): Promise<number> {
  await onPipelineCompleted(ctx, 'succeeded', undefined, {}, {
    presentation: {
      discord: {
        level: 'OK',
        title: `Pipeline Complete: ${config.project}`,
        description: 'All modules passed!',
        fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, { run_id: runId }),
      },
    },
  });
  const degradedHalt = finalizeDegradedEvidenceHaltIfNeeded(config, progress, opts, {
    scheduleProjectSummaryOnBlocked: false,
  });
  if (degradedHalt) return degradedHalt;
  try {
    appendPipelineLifecycleEvent(config, 'pipeline_run.completed', {
      progress,
      result: { terminal_status: 'succeeded', reason: 'PIPELINE_COMPLETE' },
    });
  } catch (error: unknown) {
    if (!errorMessage(error).includes('is already terminal')) throw error;
    log('INFO', `Pipeline run '${runId}' already terminal — checking terminal generators`);
    await runMissingTerminalCompletionGenerators(config, progress, opts);
    return PROCESS_SUCCESS_CODE;
  }
  log('OK', '🎉 Pipeline complete — all modules and gates PASS');
  deps.output({ exit: PROCESS_SUCCESS_CODE, status: 'PIPELINE_COMPLETE' });
  return PROCESS_SUCCESS_CODE;
}

export async function completePipeline(config: AnyRecord, progress: AnyRecord, opts: AnyRecord = {}): Promise<number> {
  const deps = getPipelineRunnerDeps(config, opts.deps);
  const persistedHaltExitCode = emitPersistedPipelineHalt(config, deps);
  if (persistedHaltExitCode !== null) return persistedHaltExitCode;

  const ctx: AnyRecord = _telemetryCtx(config) ?? { config, runId: config._runId ?? config.run_id };
  const priorPipelineState = selectDefinedValue(() => (loadLifecycleReadModels(config)?.pipeline), () => (null));
  const runId = requirePipelineRunId(config, 'Pipeline completion');
  const repaired = await repairCompletedPipeline(config, progress, opts, deps, ctx, priorPipelineState, runId);
  if (repaired !== null) return repaired;
  const unavailableHalt = haltUnavailableTerminalGenerator(config, progress, opts);
  if (unavailableHalt) return unavailableHalt;
  const previewHalt = await deliverFinalPreviewOrHalt(config, progress, opts, deps);
  if (previewHalt !== null) return previewHalt;
  const preCompletionDegradedHalt = finalizeDegradedEvidenceHaltIfNeeded(config, progress, opts);
  if (preCompletionDegradedHalt) return preCompletionDegradedHalt;
  emitPipelineCheckpoint(config, 'after_final_review_before_summary', {
    step_type: 'pipeline',
    step_id: 'pipeline_complete',
  });
  emitPipelineSummaryLifecycle(config, ctx, 'succeeded', 'PIPELINE_COMPLETE', progress, deps.writeSummary);
  const generatorHalt = await runTerminalGeneratorsOrHalt(config, progress, opts);
  if (generatorHalt !== null) return generatorHalt;
  return recordSuccessfulPipelineCompletion(config, progress, opts, deps, ctx, runId);
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
