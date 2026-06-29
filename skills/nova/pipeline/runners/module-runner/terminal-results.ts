// runners/module-runner/terminal-results.ts — terminal/retry result builders for module runner

import { getRunId } from '../../core/runtime.ts';
import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
  resolveResultSessionKey,
  resolveResultDispatchId,
  resolveResultGatewayLabel,
} from '../../services/correlation.ts';
import {
  PIPELINE_STEP_TYPES,
  PIPELINE_STEP_ACTIONS,
  PIPELINE_STEP_OUTCOMES,
  buildPipelineStepResult,
} from '../../services/contracts/pipeline-step-result.ts';
import {
  PIPELINE_TERMINAL_ACTIONS,
  PIPELINE_TERMINAL_SCOPES,
} from '../../services/contracts/terminal-decision.ts';

type AnyRecord = Record<string, any>;

export function buildRetryResult(failResult: AnyRecord, statusValue: AnyRecord) {
  return {
    retry: true,
    fail_count: failResult?.fail_count ?? statusValue?.fail_count ?? 0,
    dispatch_id: resolveResultDispatchId(failResult),
    gateway_label: resolveResultGatewayLabel(failResult),
    session_key: resolveResultSessionKey(failResult),
    last_fail: failResult?.last_fail ?? null,
  };
}

export function buildModulePassTerminalResult(config: AnyRecord, moduleId: string, {
  runId = null,
  moduleDir = null,
  attempt = null,
  phase = null,
  dispatchId = null,
  gatewayLabel = null,
  sessionKey = null,
}: AnyRecord = {}) {
  return {
    retry: false,
    result: buildPipelineStepResult({
      stepType: PIPELINE_STEP_TYPES.MODULE,
      stepId: moduleId,
      nextAction: PIPELINE_STEP_ACTIONS.CONTINUE,
      outcome: PIPELINE_STEP_OUTCOMES.PASSED,
      correlation: {
        run_id: runId ?? getRunId(config),
        module_id: moduleId,
        module_dir: moduleDir,
        attempt,
        phase,
        dispatch_id: dispatchId,
        gateway_label: gatewayLabel,
        session_key: sessionKey,
      },
      terminalAction: PIPELINE_TERMINAL_ACTIONS.NONE,
      terminalScope: PIPELINE_TERMINAL_SCOPES.MODULE,
    }),
  };
}

export function buildModuleHaltTerminalResult(config: AnyRecord, moduleId: string, {
  outcome,
  reason,
  issueType = 'environment',
  runId = null,
  moduleDir = null,
  attempt = null,
  phase = null,
  dispatchId = null,
  gatewayLabel = null,
  sessionKey = null,
  correlationProvenance = null,
  diagnostics = {},
  metadata = {},
  rateLimit = null,
  terminalAction = null,
  terminalReasonCode = null,
  terminalHumanReason = null,
  terminalSource = null,
  terminalMetadata = {},
}: AnyRecord = {}) {
  return {
    retry: false,
    result: buildPipelineStepResult({
      stepType: PIPELINE_STEP_TYPES.MODULE,
      stepId: moduleId,
      nextAction: PIPELINE_STEP_ACTIONS.HALT,
      outcome,
      issueType,
      reason,
      diagnostics: {
        ...diagnostics,
        metadata: {
          ...(diagnostics?.metadata ?? {}),
          ...metadata,
        },
      },
      correlation: {
        run_id: runId ?? getRunId(config),
        module_id: moduleId,
        module_dir: moduleDir,
        attempt,
        phase,
        dispatch_id: dispatchId,
        gateway_label: gatewayLabel,
        session_key: sessionKey,
        ...(correlationProvenance == null ? {} : { correlation_provenance: correlationProvenance }),
      },
      rateLimit,
      terminalAction,
      terminalScope: PIPELINE_TERMINAL_SCOPES.MODULE,
      terminalReasonCode,
      terminalHumanReason,
      terminalSource,
      terminalMetadata,
    }),
  };
}

export function buildModuleErrorTerminalResult(config: AnyRecord, moduleId: string, options: AnyRecord = {}) {
  return buildModuleHaltTerminalResult(config, moduleId, {
    outcome: PIPELINE_STEP_OUTCOMES.ERROR,
    issueType: 'environment',
    terminalAction: PIPELINE_TERMINAL_ACTIONS.STOP,
    ...options,
  });
}

export function buildModuleNeedsNovaTerminalResult(config: AnyRecord, moduleId: string, options: AnyRecord = {}) {
  return buildModuleHaltTerminalResult(config, moduleId, {
    outcome: PIPELINE_STEP_OUTCOMES.NEEDS_NOVA,
    issueType: 'code',
    terminalAction: PIPELINE_TERMINAL_ACTIONS.REQUEST_HANDOFF,
    ...options,
  });
}

export function buildModuleBlockedTerminalResult(config: AnyRecord, moduleId: string, options: AnyRecord = {}) {
  return buildModuleHaltTerminalResult(config, moduleId, {
    outcome: PIPELINE_STEP_OUTCOMES.BLOCKED,
    issueType: 'policy',
    terminalAction: PIPELINE_TERMINAL_ACTIONS.NOTIFY_OPERATOR,
    ...options,
  });
}

export function buildModuleRateLimitedTerminalResult(config: AnyRecord, moduleId: string, {
  rateLimitResult = {},
  reason = null,
  metadata = {},
  rateLimit = null,
  ...options
}: AnyRecord = {}) {
  const rateLimitStatus = rateLimitResult?.rate_limit_status ?? rateLimitResult?.status ?? null;
  return buildModuleHaltTerminalResult(config, moduleId, {
    outcome: PIPELINE_STEP_OUTCOMES.RATE_LIMITED,
    issueType: 'environment',
    reason: reason ?? rateLimitResult?.reason ?? 'rate_limit_exhausted',
    terminalAction: PIPELINE_TERMINAL_ACTIONS.RETRY_LATER,
    metadata,
    rateLimit: rateLimit ?? {
      max_rate_limit_pauses: rateLimitResult?.max_rate_limit_pauses ?? rateLimitStatus?.max_rate_limit_pauses ?? null,
      rate_limit_pauses: rateLimitResult?.rate_limit_pauses ?? null,
      rate_limit_status: rateLimitStatus,
    },
    ...options,
  });
}

export function buildBlockedTerminalResult(config: AnyRecord, status: AnyRecord, moduleId: string, {
  moduleDir = null,
}: AnyRecord = {}) {
  return buildModuleBlockedTerminalResult(config, moduleId, {
    reason: status?.blockedReason
      ?? status?.fail_summaries?.[status.fail_summaries.length - 1]?.summary
      ?? `Module ${moduleId} is BLOCKED`,
    runId: status?.run_id ?? status?.runId ?? status?._runId ?? null,
    moduleDir,
    attempt: status?.blockedFailCount ?? status?.fail_count ?? null,
    phase: status?.blockedPhase ?? status?.current_phase ?? null,
    dispatchId: resolveStatusDispatchId(status),
    gatewayLabel: resolveStatusGatewayLabel(status),
    sessionKey: resolveStatusSessionKey(status),
    metadata: {
      fail_count: status?.blockedFailCount ?? status?.fail_count ?? null,
    },
  });
}
