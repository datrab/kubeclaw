import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { appendPipelineLifecycleEvent } from '../services/status-store.ts';
import { onPipelineHalted, onEscalated, emitOperatorAlert } from '../services/telemetry.ts';
import { resolveResultAttempt, resolveResultSessionKey, resolveResultGatewayLabel, resolveResultDispatchId } from '../services/correlation.ts';
import { pipelineStepDiagnosticSummary, pipelineStepRateLimitDetails } from '../services/contracts/pipeline-step-result.ts';
import { _telemetryCtx, buildEscalationPayload, buildPipelineHaltPayload, buildResultWithStepCorrelation, resolvePipelineGateType } from './pipeline-runner-shared.ts';
import { getPipelineRunnerDeps } from './pipeline-runner-deps.ts';
import { getRunId } from '../core/runtime.ts';
import { runScheduledGenerator } from './pipeline-runner-terminal-generators.ts';
import { emitPipelineSummaryLifecycle, normalizeStepResultForPipeline, processExitCodeForTerminalStatus } from './pipeline-runner-terminal-results.ts';

type AnyRecord = Record<string, any>;
const TERMINAL_HALT_STATUS_MISSING = 'failed';
const OPERATOR_ALERT_REASON_MISSING = 'see previous alert';
function objectRecord(value: unknown): AnyRecord | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : null; }
function requirePipelineRunId(config: AnyRecord, purpose: string): string { const runId = getRunId(config); if (!runId) throw new Error(`${purpose} requires a run id`); return runId; }
function shouldInjectNeedsNovaForTerminalStatus(status: string | null | undefined): boolean { return status != null && ['action_required', 'timed_out'].includes(status); }
function shouldEmitEscalationForTerminalStatus(status: string | null | undefined): boolean { return status != null && ['action_required', 'timed_out', 'blocked'].includes(status); }

function terminalHaltContext(config: AnyRecord, progress: AnyRecord, input: AnyRecord) {
  const deps = getPipelineRunnerDeps(config, input.opts.deps);
  const telemetry = { ..._telemetryCtx(config), deps: input.opts.deps ?? null };
  const normalized = normalizeStepResultForPipeline(input.result, { stepType: input.stepType, stepId: input.stepId });
  const stepResult = normalized.stepResult;
  const status = normalized.terminalStatus ?? TERMINAL_HALT_STATUS_MISSING;
  const decision = normalized.terminalDecision ?? null;
  const rateLimit = pipelineStepRateLimitDetails(stepResult);
  const rateLimited = status === 'rate_limited';
  const operatorReason = pipelineStepDiagnosticSummary(stepResult) ?? OPERATOR_ALERT_REASON_MISSING;
  const correlatedResult = buildResultWithStepCorrelation(config, progress, input.stepType, input.stepId, {
    terminal_status: status, terminal_decision: decision, step_type: stepResult.stepType, step_id: stepResult.stepId,
    outcome: stepResult.outcome, next_action: stepResult.nextAction,
    ...(stepResult.issueType ? { issue_type: stepResult.issueType } : {}), reason: operatorReason,
    ...(objectRecord(stepResult.diagnostics?.metadata) ?? {}), ...(objectRecord(stepResult.correlation) ?? {}),
    ...(rateLimited ? { rate_limit_authority: rateLimit.source, rate_limit_exhausted: rateLimit.rate_limit_exhausted, max_rate_limit_pauses: rateLimit.max_rate_limit_pauses, rate_limit_status: rateLimit.rate_limit_status } : {}),
  }, deps);
  const haltReason = decision?.reasonCode ?? 'failed';
  return {
    ...input, deps, telemetry, stepResult, status, decision, rateLimit, rateLimited, operatorReason, correlatedResult, haltReason,
    gateType: resolvePipelineGateType(progress, input.stepType, input.stepId, correlatedResult),
    exitCode: processExitCodeForTerminalStatus(status),
    summaryReason: input.summaryReason ?? `terminal_halt:${haltReason}:${input.stepId}`,
  };
}

async function emitTerminalHaltAlert(config: AnyRecord, progress: AnyRecord, ctx: AnyRecord) {
  appendPipelineLifecycleEvent(config, 'pipeline_run.halted', { progress, result: ctx.correlatedResult, stepType: ctx.stepType, stepId: ctx.stepId, haltReason: String(ctx.haltReason).toLowerCase() });
  const identity = {
    run_id: requirePipelineRunId(config, 'Pipeline halt Discord identity'),
    module_id: ctx.stepType === 'module' ? ctx.stepId : null,
    gate_id: ctx.stepType === 'gate' ? ctx.stepId : null,
    gate_type: ctx.gateType,
    step_type: ctx.stepType,
    attempt: resolveResultAttempt(ctx.correlatedResult), dispatch_id: resolveResultDispatchId(ctx.correlatedResult),
    gateway_label: resolveResultGatewayLabel(ctx.correlatedResult), session_key: resolveResultSessionKey(ctx.correlatedResult),
  };
  await emitOperatorAlert(ctx.telemetry, 'pipeline.operator_alert', {
    ...identity, terminal_status: ctx.status, terminal_decision: ctx.decision, reason: ctx.operatorReason,
    ...(ctx.rateLimited ? { rate_limit_exhausted: ctx.rateLimit.rate_limit_exhausted, max_rate_limit_pauses: ctx.rateLimit.max_rate_limit_pauses } : {}),
  }, {
    hookId: 'pipeline.completed',
    presentation: { discord: {
      level: 'CRITICAL', title: `Pipeline halted: ${config.project}`,
      description: `Pipeline stopped at ${ctx.stepType} '${ctx.stepId}'. Status: ${ctx.status}.`,
      fields: [
        ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, identity),
        { name: 'Stopped At', value: `${ctx.stepType}:${ctx.stepId}` }, { name: 'Status', value: String(ctx.status) },
        { name: 'Reason', value: String(ctx.operatorReason).slice(0, 200) },
        ...(ctx.rateLimited && ctx.rateLimit.max_rate_limit_pauses != null ? [{ name: 'Rate Limit Pauses', value: String(ctx.rateLimit.max_rate_limit_pauses) }] : []),
        { name: 'Action', value: ctx.status === 'blocked' ? 'Fix manually, then --resume' : 'Inspect terminal failure evidence before rerun' },
      ],
    } },
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
  const terminal = terminalHaltContext(config, progress, { stepType, stepId, result, opts, summaryReason, scheduleProjectSummaryOnBlocked });
  await emitTerminalHaltAlert(config, progress, terminal);
  if (shouldInjectNeedsNovaForTerminalStatus(terminal.status)) {
    await terminal.deps.injectNeedsNova(config, terminal.correlatedResult, opts.novaChannel, stepType, stepId);
  }
  if (shouldEmitEscalationForTerminalStatus(terminal.status)) {
    onEscalated(terminal.telemetry, stepType, stepId, {
      ...buildEscalationPayload(stepType, stepId, terminal.correlatedResult, terminal.haltReason, terminal.gateType),
    });
  }
  terminal.deps.output({ exit: terminal.exitCode, ...terminal.correlatedResult });
  onPipelineHalted(terminal.telemetry, buildPipelineHaltPayload(stepType, stepId, terminal.correlatedResult, terminal.haltReason, terminal.gateType));
  emitPipelineSummaryLifecycle(config, terminal.telemetry, terminal.status, terminal.summaryReason, progress, terminal.deps.writeSummary, terminal.decision);

  if (scheduleProjectSummaryOnBlocked && terminal.status === 'blocked') {
    await runScheduledGenerator(config, progress, 'generator:project_summary', {
      scheduleReason: 'blocked_terminal_halt',
      mode: 'full',
      ...(stepType === 'module' ? { moduleId: stepId } : {}),
      ...(stepType === 'gate' ? { gateId: stepId } : {}),
      terminalStatus: terminal.status,
      reasonCode: terminal.summaryReason,
      orderIndex: 1,
      causationRef: 'event:pipeline_run.halted',
    });
  }
  return terminal.exitCode;
}
