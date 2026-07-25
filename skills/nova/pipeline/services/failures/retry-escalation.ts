import { getRunId, getRunStats } from '../../core/runtime.ts';
import { applyModuleCompletion } from '../status-store.ts';
import { onModuleFail } from '../telemetry.ts';
import {
  buildPipelineStepResult,
  PIPELINE_STEP_ACTIONS,
  PIPELINE_STEP_OUTCOMES,
  PIPELINE_STEP_TYPES,
} from '../contracts/pipeline-step-result.ts';
import {
  PIPELINE_TERMINAL_ACTIONS,
  PIPELINE_TERMINAL_SCOPES,
} from '../contracts/terminal-decision.ts';
import { normalizeFailureClass } from '../failure-semantics.ts';
import { selectTruthyValue } from '../../optional-absence.ts';
import { telemetryCtx, truncateForDiscord } from './presentation.ts';
import { buildFullPipelineResumeCommand } from './retry-command.ts';
import { resolveFailureCorrelation } from './retry-context.ts';

function failureTimeoutFlag(value: any) {
  return value === true;
}

function terminalFailureClass(status: any) {
  return selectTruthyValue(
    () => status.fail_summaries[status.fail_summaries.length - 1]?.failure_class,
    () => null
  );
}

function applyEscalationCompletion(context: any, autoRetryThreshold: number) {
  const {
    config,
    status,
    moduleDir,
    moduleId,
    maxFails,
    phase,
    reason,
    isTimeout,
    correlation,
  } = context;
  applyModuleCompletion(config, moduleDir, status, {
    target_kind: 'module',
    target_id: moduleId,
    phase,
    attempt: status.fail_count,
    status: 'ERROR',
    authority: { kind: 'worker' },
    reason_code: terminalFailureClass(status),
    summary: selectTruthyValue(
      () => reason,
      () => `${phase} ${isTimeout ? 'timed out' : 'failed'} (attempt ${status.fail_count}/${maxFails})`
    ),
    observed: {
      dispatch_id: correlation.dispatchId,
      gateway_label: correlation.gatewayLabel,
      session_key: correlation.sessionKey,
    },
    metadata: {
      fail_count: status.fail_count,
      max_fails: maxFails,
      auto_retry_threshold: autoRetryThreshold,
      is_timeout: isTimeout,
    },
  });
}

async function emitEscalationTelemetry(context: any, autoRetryThreshold: number) {
  const {
    config,
    status,
    moduleId,
    maxFails,
    phase,
    reason,
    isTimeout,
    contextFields,
    failEvent,
  } = context;
  const escalationReason = isTimeout
    ? 'Agent timed out.'
    : `Auto-retry exhausted (${autoRetryThreshold}x). Nova must analyze and provide new prompt.`;
  await onModuleFail(telemetryCtx(config), moduleId, {
    ...failEvent,
    presentation: {
      discord: {
        level: 'WARN',
        title: `Module ${moduleId} ${isTimeout ? 'TIMEOUT' : 'NEEDS_NOVA'} (${phase})`,
        description: `Attempt ${status.fail_count}/${maxFails}. ${escalationReason}`,
        fields: [
          { name: 'Status', value: 'FAIL' },
          {
            name: 'Action',
            value: isTimeout
              ? 'Inspect timeout evidence and rerun the module'
              : 'Resume with --prompt',
          },
          ...(isTimeout ? [{ name: 'Type', value: 'TIMEOUT' }] : []),
          ...contextFields,
          ...(reason
            ? [{ name: 'Reason', value: truncateForDiscord(reason, 1024), inline: false }]
            : []),
        ],
      },
    },
  });
}

export async function handleNovaEscalation(
  context: any,
  autoRetryThreshold: number
) {
  const stats = getRunStats(context.config);
  if (stats) stats.modules_failed.push(context.moduleId);
  applyEscalationCompletion(context, autoRetryThreshold);
  await emitEscalationTelemetry(context, autoRetryThreshold);
  return buildNovaEscalation({
    ...context,
    autoRetryThreshold,
  });
}

function failureClassForSummary(failure: any) {
  return failure.failure_class ?? normalizeFailureClass(
    failure.phase,
    failure.summary,
    {
      isTimeout: failureTimeoutFlag(failure.is_timeout),
      failurePattern: failure.failPattern,
    }
  );
}

function buildFailHistory(status: any) {
  return status.fail_summaries.map((failure: any) => ({
    attempt: failure.attempt,
    phase: failure.phase,
    summary: failure.summary,
    failPattern: failure.failPattern,
    failure_class: failureClassForSummary(failure),
    is_timeout: failureTimeoutFlag(failure.is_timeout),
    files_changed: selectTruthyValue(() => failure.files_changed, () => null),
    timestamp: failure.timestamp,
  }));
}

function buildModuleStatus(status: any, correlation: any) {
  return {
    status: status.status,
    current_phase: status.current_phase,
    started_at: status.started_at,
    attempt: status.fail_count,
    dispatch_id: correlation.dispatchId,
    gateway_label: correlation.gatewayLabel,
    session_key: correlation.sessionKey,
    forge_commit_hash: selectTruthyValue(
      () => status.forge_commit_hash,
      () => null
    ),
    cost: status.cost,
  };
}

function escalationReason(input: any) {
  return input.isTimeout
    ? `${input.phase} timed out — agent did not respond within time limit`
    : `${input.phase} failed ${input.status.fail_count}x — auto-retry exhausted, Nova must intervene`;
}

export function buildNovaEscalation(input: any) {
  const {
    config,
    status,
    moduleId,
    moduleDir,
    maxFails,
    phase,
    isTimeout,
    autoRetryThreshold,
    opts = {},
  } = input;
  const correlation = input.correlation
    ?? resolveFailureCorrelation(status, opts);
  const failureClass = terminalFailureClass(status);
  return buildPipelineStepResult({
    stepType: PIPELINE_STEP_TYPES.MODULE,
    stepId: moduleId,
    nextAction: PIPELINE_STEP_ACTIONS.HALT,
    outcome: isTimeout
      ? PIPELINE_STEP_OUTCOMES.TIMEOUT
      : PIPELINE_STEP_OUTCOMES.NEEDS_NOVA,
    issueType: isTimeout ? 'environment' : 'code',
    reason: escalationReason(input),
    diagnostics: {
      metadata: {
        module: moduleId,
        module_dir: moduleDir,
        is_timeout: isTimeout,
        fail_count: status.fail_count,
        max_fails: maxFails,
        auto_retry_threshold: autoRetryThreshold,
        remaining_attempts: maxFails - status.fail_count,
        fail_history: buildFailHistory(status),
        last_fail: selectTruthyValue(
          () => status.fail_summaries[status.fail_summaries.length - 1],
          () => null
        ),
        module_status: buildModuleStatus(status, correlation),
        resume_command: buildFullPipelineResumeCommand(
          config,
          'YOUR_NEW_APPROACH_HERE'
        ),
      },
    },
    correlation: {
      run_id: getRunId(config),
      module_id: moduleId,
      module_dir: moduleDir,
      attempt: status.fail_count,
      phase,
      dispatch_id: correlation.dispatchId,
      gateway_label: correlation.gatewayLabel,
      session_key: correlation.sessionKey,
    },
    terminalAction: PIPELINE_TERMINAL_ACTIONS.REQUEST_HANDOFF,
    terminalScope: PIPELINE_TERMINAL_SCOPES.MODULE,
    terminalReasonCode: isTimeout ? failureClass : 'needs_nova',
  });
}
