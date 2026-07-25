import { log } from '../../core/logger.ts';
import { getRunStats } from '../../core/runtime.ts';
import { applyModuleCompletion } from '../status-store.ts';
import { onModuleBlocked, onModuleFail, onRetryExhausted } from '../telemetry.ts';
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
import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
import { telemetryCtx, truncateForDiscord } from './presentation.ts';

const MAX_FAILS_REACHED_REASON = 'max_fails_reached';

function terminalFailureClass(status: any) {
  return selectTruthyValue(
    () => status.fail_summaries[status.fail_summaries.length - 1]?.failure_class,
    () => null
  );
}

function applyBlockedCompletion(context: any, failureClass: any) {
  const {
    config,
    status,
    moduleDir,
    moduleId,
    maxFails,
    phase,
    reason,
    correlation,
  } = context;
  applyModuleCompletion(config, moduleDir, status, {
    target_kind: 'module',
    target_id: moduleId,
    phase,
    attempt: status.fail_count,
    status: 'BLOCKED',
    authority: { kind: 'worker' },
    reason_code: failureClass,
    summary: `Max retries (${maxFails}) exceeded`,
    occurred_at: new Date().toISOString(),
    observed: {
      dispatch_id: correlation.dispatchId,
      gateway_label: correlation.gatewayLabel,
      session_key: correlation.sessionKey,
    },
    metadata: {
      fail_count: status.fail_count,
      max_fails: maxFails,
      reason: selectDefinedValue(() => reason, () => MAX_FAILS_REACHED_REASON),
    },
  });
}

async function emitBlockedTelemetry(context: any) {
  const {
    config,
    status,
    moduleId,
    maxFails,
    phase,
    reason,
    contextFields,
    correlation,
    failEvent,
  } = context;
  const telemetry = telemetryCtx(config);
  await onModuleFail(telemetry, moduleId, failEvent);
  await onRetryExhausted(telemetry, moduleId, {
    attempt: status.fail_count,
    phase,
    dispatch_id: correlation.dispatchId,
    gateway_label: correlation.gatewayLabel,
    session_key: correlation.sessionKey,
    reason: selectTruthyValue(() => reason, () => null),
    max_attempts: maxFails,
    max_fails: maxFails,
  });
  await onModuleBlocked(telemetry, moduleId, {
    ...failEvent,
    old_status: 'FAIL',
    reason: `Max retries (${maxFails}) exceeded${phase ? ` in ${phase}` : ''}`,
    presentation: {
      discord: {
        level: 'CRITICAL',
        title: `Module ${moduleId} BLOCKED`,
        description: `Failed ${maxFails} times in ${phase} phase. Human intervention needed.`,
        fields: [
          ...contextFields,
          { name: 'Status', value: 'BLOCKED' },
          {
            name: 'Action',
            value: 'Inspect module failure evidence and resume after fixing',
          },
          ...(reason
            ? [{ name: 'Reason', value: truncateForDiscord(reason, 1024), inline: false }]
            : []),
        ],
      },
    },
  });
}

function buildBlockedResult(context: any, failureClass: any) {
  const {
    status,
    moduleId,
    maxFails,
    phase,
    correlation,
  } = context;
  return buildPipelineStepResult({
    stepType: PIPELINE_STEP_TYPES.MODULE,
    stepId: moduleId,
    nextAction: PIPELINE_STEP_ACTIONS.HALT,
    outcome: PIPELINE_STEP_OUTCOMES.BLOCKED,
    issueType: 'policy',
    reason: `Max retries exceeded (${phase})`,
    diagnostics: {
      metadata: {
        module: moduleId,
        attempt: status.fail_count,
        status,
        dispatch_id: correlation.dispatchId,
        gateway_label: correlation.gatewayLabel,
        session_key: correlation.sessionKey,
      },
    },
    correlation: {
      module_id: moduleId,
      attempt: status.fail_count,
      dispatch_id: correlation.dispatchId,
      gateway_label: correlation.gatewayLabel,
      session_key: correlation.sessionKey,
    },
    terminalAction: PIPELINE_TERMINAL_ACTIONS.NOTIFY_OPERATOR,
    terminalScope: PIPELINE_TERMINAL_SCOPES.MODULE,
    terminalReasonCode: failureClass,
  });
}

export async function handleBlockedFailure(context: any) {
  const failureClass = terminalFailureClass(context.status);
  applyBlockedCompletion(context, failureClass);
  await emitBlockedTelemetry(context);
  log(
    'ERROR',
    `Module ${context.moduleId} BLOCKED — failed ${context.maxFails}x in ${context.phase} phase`
  );
  const stats = getRunStats(context.config);
  if (stats) stats.modules_blocked.push(context.moduleId);
  return buildBlockedResult(context, failureClass);
}
