// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';

import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { log } from '../core/logger.ts';
import {
  appendPipelineLifecycleEvent,
  loadLifecycleReadModels,
} from '../services/status-store.ts';
import {
  onPipelineCompleted,
  onPipelineHalted,
  onSummaryStarted,
  onSummaryCompleted,
  onEscalated,
  emitOperatorAlert,
} from '../services/telemetry.ts';
import { writeCostReport } from '../services/observability.ts';
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
} from '../services/contracts/terminal-decision.ts';
import {
  _telemetryCtx,
  buildEscalationPayload,
  buildPipelineHaltPayload,
  buildBlockedModuleResult,
  buildResultWithStepCorrelation,
  resolvePipelineGateType,
} from './pipeline-runner-shared.ts';
import { runScheduledGenerator as runScheduledGeneratorImpl } from './pipeline-runner-scheduling.ts';
import { getPipelineRunnerDeps } from './pipeline-runner-deps.ts';
import { getPipelineArtifactBundle } from '../services/artifact-bundle.ts';
import { getRunId } from '../core/runtime.ts';
import { resolvePipelineRunLogDir } from '../core/paths.ts';
import { deliverFinalPreviews } from '../services/preview-delivery.ts';

type AnyRecord = Record<string, any>;
type TerminalGeneratorRunState = {
  path: string | null;
  completed: Set<string>;
  durableLoaded: boolean;
};

const TERMINAL_COMPLETION_GENERATORS = Object.freeze([
  {
    stageId: 'generator:project_summary',
    opts: { orderIndex: 1 },
  },
  {
    stageId: 'generator:pipeline_review',
    opts: { orderIndex: 2 },
  },
  {
    stageId: 'generator:case_study',
    opts: { orderIndex: 3 },
  },
]);

const PROCESS_SUCCESS_CODE = 0;
const PROCESS_FAILURE_CODE = 1;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function shouldInjectNeedsNovaForTerminalStatus(terminalStatus: string | null | undefined): boolean {
  return terminalStatus === 'action_required' || terminalStatus === 'timed_out';
}

function shouldEmitEscalationForTerminalStatus(terminalStatus: string | null | undefined): boolean {
  return terminalStatus === 'action_required' || terminalStatus === 'timed_out' || terminalStatus === 'blocked';
}

export function processExitCodeForTerminalStatus(terminalStatus: string | null | undefined): number {
  return terminalStatus === 'succeeded' ? PROCESS_SUCCESS_CODE : PROCESS_FAILURE_CODE;
}

function buildInvalidPipelineStepResult(result: AnyRecord, { stepType = PIPELINE_STEP_TYPES.PIPELINE, stepId = 'unknown' }: AnyRecord = {}): AnyRecord {
  const normalizedStepType = Object.values(PIPELINE_STEP_TYPES).includes(stepType)
    ? stepType
    : PIPELINE_STEP_TYPES.PIPELINE;
  const normalizedStepId = stepId == null ? 'unknown' : String(stepId);
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
        rejected_result_kind: result?.kind || null,
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
    terminal_status: terminalStatus || null,
    terminal_decision: terminalDecision || null,
    reason_code: reasonCode || null,
  };
  onSummaryStarted(ctx, 'pipeline', baseData);
  const summaryResult = writeSummaryFn(config, terminalStatus, reasonCode, ctx, progress) || {};
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

async function runScheduledGenerator(config: AnyRecord, progress: AnyRecord, stageId: string, opts: AnyRecord = {}): Promise<AnyRecord> {
  return runScheduledGeneratorImpl(config, progress, stageId, opts, getPipelineRunnerDeps(config, opts.deps));
}

function terminalGeneratorCompletionPath(config: AnyRecord): string | null {
  const runId = getRunId(config) || config?._runId || config?.run_id || null;
  const runLogDir = resolvePipelineRunLogDir(config, runId);
  return runLogDir ? path.join(runLogDir, 'terminal-generator-completions.json') : null;
}

function terminalGeneratorRunState(config: AnyRecord): TerminalGeneratorRunState {
  const filePath = terminalGeneratorCompletionPath(config);
  if (!config._terminalGeneratorRunState || typeof config._terminalGeneratorRunState !== 'object' || config._terminalGeneratorRunState.path !== filePath) {
    config._terminalGeneratorRunState = { path: filePath, completed: new Set<string>(), durableLoaded: false };
  }
  if (!(config._terminalGeneratorRunState.completed instanceof Set)) {
    config._terminalGeneratorRunState.completed = new Set(Array.isArray(config._terminalGeneratorRunState.completed) ? config._terminalGeneratorRunState.completed : []);
  }
  return config._terminalGeneratorRunState as TerminalGeneratorRunState;
}

function loadTerminalGeneratorCompletions(config: AnyRecord): TerminalGeneratorRunState {
  const state = terminalGeneratorRunState(config);
  if (state.durableLoaded === true) return state;
  state.durableLoaded = true;
  const filePath = terminalGeneratorCompletionPath(config);
  if (!filePath || !fs.existsSync(filePath)) return state;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const entries = Array.isArray(parsed?.completed) ? parsed.completed : [];
    for (const entry of entries) {
      const stageId = typeof entry === 'string' ? entry : entry?.stage_id;
      if (stageId) state.completed.add(String(stageId));
    }
  } catch (error) {
    throw new Error(`Terminal generator completion state is unreadable and requires repair: ${errorMessage(error)}`);
  }
  return state;
}

function saveTerminalGeneratorCompletions(config: AnyRecord, state: TerminalGeneratorRunState = terminalGeneratorRunState(config)): void {
  const filePath = terminalGeneratorCompletionPath(config);
  if (!filePath) return;
  const completedAt = new Date().toISOString();
  const payload = {
    schemaVersion: 'v1',
    project: config?.project || null,
    run_id: getRunId(config) || config?._runId || config?.run_id || null,
    completed: [...state.completed].sort().map((stageId: string) => ({ stage_id: stageId, completed_at: completedAt })),
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n');
  fs.renameSync(tmp, filePath);
}

function isTerminalGeneratorComplete(config: AnyRecord, stageId: string): boolean {
  return loadTerminalGeneratorCompletions(config).completed.has(stageId);
}

function markTerminalGeneratorComplete(config: AnyRecord, stageId: string): void {
  if (!stageId) return;
  const state = loadTerminalGeneratorCompletions(config);
  state.completed.add(stageId);
  saveTerminalGeneratorCompletions(config, state);
}

function didTerminalGeneratorSucceed(result: AnyRecord): boolean {
  return result?.outputs?.status !== 'failed';
}

async function runTerminalCompletionGenerator(config: AnyRecord, progress: AnyRecord, stageId: string, opts: AnyRecord = {}): Promise<void> {
  if (isTerminalGeneratorComplete(config, stageId)) return;
  const result = await runScheduledGenerator(config, progress, stageId, {
    scheduleReason: 'pipeline_complete',
    mode: 'full',
    terminalStatus: 'succeeded',
    reasonCode: 'PIPELINE_COMPLETE',
    causationRef: 'event:pipeline_run.completed',
    ...opts,
  });
  if (didTerminalGeneratorSucceed(result)) {
    markTerminalGeneratorComplete(config, stageId);
  }
}

async function runMissingTerminalCompletionGenerators(config: AnyRecord, progress: AnyRecord, opts: AnyRecord = {}): Promise<void> {
  for (const generator of TERMINAL_COMPLETION_GENERATORS) {
    await runTerminalCompletionGenerator(config, progress, generator.stageId, {
      ...generator.opts,
      deps: opts.deps,
    });
  }
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
  const ctx = { ..._telemetryCtx(config), deps: opts.deps || null };
  const normalizedResult = normalizeStepResultForPipeline(result, { stepType, stepId });
  const stepResult = normalizedResult.stepResult;
  const terminalStatus = normalizedResult.terminalStatus || 'failed';
  const terminalDecision = normalizedResult.terminalDecision || null;
  const exitCode = processExitCodeForTerminalStatus(terminalStatus);
  const typedOperatorReason = pipelineStepDiagnosticSummary(stepResult) || 'see previous alert';
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
    ...(stepResult.diagnostics?.metadata || {}),
    ...(stepResult.correlation || {}),
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
  const haltReason = terminalDecision?.reasonCode || terminalStatus || 'failed';
  const operatorReason = typedOperatorReason;
  const resolvedSummaryReason = summaryReason || `${haltReason}:${stepId}`;

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
          ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, { run_id: config._runId || config.run_id || 'unknown', module_id: stepType === 'module' ? stepId : null, gate_id: stepType === 'gate' ? stepId : null, gate_type: gateType, step_type: stepType, attempt: resolveResultAttempt(correlatedResult), dispatch_id: resolveResultDispatchId(correlatedResult), gateway_label: resolveResultGatewayLabel(correlatedResult), session_key: resolveResultSessionKey(correlatedResult) }),
          { name: 'Stopped At', value: `${stepType}:${stepId}` },
          { name: 'Status', value: String(terminalStatus) },
          { name: 'Reason', value: String(operatorReason).slice(0, 200) },
          ...(isRateLimited && maxRateLimitPauses != null ? [{ name: 'Rate Limit Pauses', value: String(maxRateLimitPauses) }] : []),
          ...(terminalStatus === 'blocked' ? [{ name: 'Action', value: 'Fix manually, then --resume' }] : []),
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
  try { writeCostReport(config); } catch (_error) { /* non-critical */ }

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
  const priorPipelineState = loadLifecycleReadModels(config)?.pipeline || null;
  if (priorPipelineState?.run_id === (config._runId || config.run_id || null) && priorPipelineState?.status === 'COMPLETED') {
    log('INFO', `Pipeline run '${priorPipelineState.run_id}' already completed — checking terminal generators`);
    await runMissingTerminalCompletionGenerators(config, progress, opts);
    return PROCESS_SUCCESS_CODE;
  }

  const deps = getPipelineRunnerDeps(config, opts.deps);
  const ctx = _telemetryCtx(config);
  const completionFields = buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, { run_id: config._runId || config.run_id || 'unknown' });
  try {
    appendPipelineLifecycleEvent(config, 'pipeline_run.completed', {
      progress,
      result: { terminal_status: 'succeeded', reason: 'PIPELINE_COMPLETE' },
    });
  } catch (error) {
    if (!errorMessage(error).includes('is already terminal')) throw error;
    log('INFO', `Pipeline run '${config._runId || config.run_id || 'unknown'}' already terminal — checking terminal generators`);
    await runMissingTerminalCompletionGenerators(config, progress, opts);
    return PROCESS_SUCCESS_CODE;
  }
  log('OK', '🎉 Pipeline complete — all modules and gates PASS');
  deps.output({ exit: PROCESS_SUCCESS_CODE, status: 'PIPELINE_COMPLETE' });
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
  emitPipelineSummaryLifecycle(config, ctx, 'succeeded', 'PIPELINE_COMPLETE', progress, deps.writeSummary);
  try {
    await deliverFinalPreviews(config, progress, { discord: deps.discord, deps: opts.deps });
  } catch (error) {
    log('WARN', `Final preview delivery failed: ${errorMessage(error)}`);
  }
  try { writeCostReport(config); } catch (_error) { /* non-critical */ }
  await runMissingTerminalCompletionGenerators(config, progress, opts);
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
