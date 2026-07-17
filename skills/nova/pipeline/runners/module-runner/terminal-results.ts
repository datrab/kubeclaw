import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
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

function diagnosticsMetadata(diagnostics: AnyRecord = {}): AnyRecord {
  return diagnostics?.metadata && typeof diagnostics.metadata === 'object' && !Array.isArray(diagnostics.metadata)
    ? diagnostics.metadata
    : {};
}

function blockedModuleReason(status: AnyRecord, moduleId: string): string {
  if (typeof status?.blockedReason === 'string' && status.blockedReason.trim()) return status.blockedReason;
  const latestSummary = status?.fail_summaries?.[status.fail_summaries.length - 1]?.summary;
  if (typeof latestSummary === 'string' && latestSummary.trim()) return latestSummary;
  return `Module ${moduleId} is BLOCKED`;
}

function moduleTerminalRunId(config: AnyRecord, providedRunId: string | null): string | null {
  return selectDefinedValue(() => (providedRunId), () => (getRunId(config)));
}

function moduleTerminalReasonCode(reasonCode: string | null, failureClass: string | null): string | null {
  return selectDefinedValue(() => (reasonCode), () => (failureClass));
}

function moduleRateLimitDetails(rateLimit: AnyRecord | null, rateLimitResult: AnyRecord) {
  if (rateLimit) return rateLimit;
  const rateLimitStatus = selectDefinedValue(() => (selectDefinedValue(() => (rateLimitResult?.rate_limit_status), () => (rateLimitResult?.status))), () => (null));
  return {
    max_rate_limit_pauses: selectDefinedValue(() => (rateLimitResult?.max_rate_limit_pauses), () => (null)),
    rate_limit_pauses: selectDefinedValue(() => (rateLimitResult?.rate_limit_pauses), () => (null)),
    rate_limit_status: rateLimitStatus,
  };
}

export function buildRetryResult(failResult: AnyRecord, statusValue: AnyRecord) {
  return {
    retry: true,
    fail_count: selectDefinedValue(() => (failResult?.fail_count), () => (0)),
    dispatch_id: resolveResultDispatchId(failResult),
    gateway_label: resolveResultGatewayLabel(failResult),
    session_key: resolveResultSessionKey(failResult),
    last_fail: selectDefinedValue(() => (failResult?.last_fail), () => (null)),
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
        run_id: moduleTerminalRunId(config, runId),
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
  const typedFailureClass = typeof metadata?.failure_class === 'string' && metadata.failure_class.trim()
    ? metadata.failure_class.trim()
    : null;
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
          ...diagnosticsMetadata(diagnostics),
          ...metadata,
        },
      },
      correlation: {
        run_id: moduleTerminalRunId(config, runId),
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
      terminalReasonCode: moduleTerminalReasonCode(terminalReasonCode, typedFailureClass),
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

export function buildModuleTimedOutTerminalResult(config: AnyRecord, moduleId: string, options: AnyRecord = {}) {
  return buildModuleHaltTerminalResult(config, moduleId, {
    ...options,
    outcome: PIPELINE_STEP_OUTCOMES.TIMEOUT,
    issueType: 'environment',
    terminalAction: PIPELINE_TERMINAL_ACTIONS.STOP,
    metadata: {
      ...(options.metadata || {}),
      failure_class: 'timeout',
    },
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
  return buildModuleHaltTerminalResult(config, moduleId, {
    outcome: PIPELINE_STEP_OUTCOMES.RATE_LIMITED,
    issueType: 'environment',
    reason: selectDefinedValue(() => (reason), () => ('rate_limit_exhausted')),
    terminalAction: PIPELINE_TERMINAL_ACTIONS.RETRY_LATER,
    metadata,
    rateLimit: moduleRateLimitDetails(rateLimit, rateLimitResult),
    ...options,
  });
}

export function buildBlockedTerminalResult(config: AnyRecord, status: AnyRecord, moduleId: string, {
  moduleDir = null,
}: AnyRecord = {}) {
  return buildModuleBlockedTerminalResult(config, moduleId, {
    reason: blockedModuleReason(status, moduleId),
    runId: selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (status?.run_id), () => (status?.runId))), () => (status?._runId))), () => (null)),
    moduleDir,
    attempt: selectDefinedValue(() => (status?.blockedFailCount), () => (null)),
    phase: selectDefinedValue(() => (status?.blockedPhase), () => (null)),
    dispatchId: resolveStatusDispatchId(status),
    gatewayLabel: resolveStatusGatewayLabel(status),
    sessionKey: resolveStatusSessionKey(status),
    metadata: {
      fail_count: selectDefinedValue(() => (status?.blockedFailCount), () => (null)),
    },
  });
}
