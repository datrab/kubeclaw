import { log } from '../../../core/logger.ts';
import { emitPipelineCheckpoint } from '../../../services/pipeline-checkpoint.ts';
import { currentAttemptNumber } from '../../module-runner-shared.ts';
import { resolveCompletionDispatchId, resolveCompletionGatewayLabel } from './identity.ts';
import { applyModuleRunnerCompletion } from '../completions.ts';
import { buildModuleBlockedTerminalResult } from '../terminal-results.ts';
import {
  exhaustCrashTerminalFailure,
  handleInfraTerminalFailure,
  handleOutputArtifactTerminalFailure,
  retryCrashTerminalFailure,
} from './terminal-failure-infrastructure.ts';
import { handlePreTestTerminalFailure } from './terminal-failure-pretest.ts';

type AnyRecord = Record<string, any>;

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Buster terminal failure requires ${field}`);
  return value.trim();
}

function optionalNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requirePositiveAttempt(value: unknown, field: string): number {
  const attempt = Number(value);
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error(`Buster terminal failure requires ${field}`);
  return attempt;
}

function buildTerminalFailureContext(input: AnyRecord): AnyRecord {
  const { config, moduleId, status, redisEntry, failureClass: explicitFailureClass, completionIdentity, completionSessionKey } = input;
  return {
    ...input,
    source: redisEntry?.source ?? 'missing_source',
    resultRedisEntry: redisEntry ?? null,
    failureClass: String(explicitFailureClass ?? '').trim().toLowerCase(),
    runId: requireNonEmptyString(completionIdentity?.runId, 'completionIdentity.runId'),
    attempt: requirePositiveAttempt(currentAttemptNumber(status), 'current status attempt'),
    statusName: requireNonEmptyString(status?.status, 'status.status'),
    completionDispatchId: resolveCompletionDispatchId(status, completionIdentity),
    completionGatewayLabel: resolveCompletionGatewayLabel(status, completionIdentity),
    terminalSessionKey: optionalNonEmptyString(completionSessionKey),
  };
}

function handleMissingFailureClass(context: AnyRecord) {
  const { config, moduleId, dir, status, deps, completionIdentity, completionGatewayLabel, terminalSessionKey, runId, attempt, source } = context;
  const reason = 'Buster terminal failure lacks explicit typed failure_class';
  log('ERROR', `Module ${moduleId}: ${reason}`);
  applyModuleRunnerCompletion({
    deps, config, dir, status, moduleId, phase: 'buster', attempt, completionStatus: 'BLOCKED',
    authority: { kind: 'worker' }, reasonCode: 'buster_failure_class_missing', summary: reason,
    dispatchId: completionIdentity.dispatchId, gatewayLabel: completionGatewayLabel, sessionKey: terminalSessionKey,
    metadata: { fail_count: status.fail_count },
  });
  return { terminal: buildModuleBlockedTerminalResult(config, moduleId, {
    reason, runId, moduleDir: dir, attempt, phase: 'buster', dispatchId: completionIdentity.dispatchId,
    gatewayLabel: completionGatewayLabel, sessionKey: terminalSessionKey,
    diagnostics: { metadata: { code: 'buster_failure_class_missing', redis_source: source } },
  }) };
}

async function handleNormalBusterTestFailure(context: AnyRecord) {
  const {
    config, moduleId, status, deps, completionIdentity, completionGatewayLabel,
    terminalSessionKey, handleModuleFail, buildRetryResult, recalledMemoryIds, attempt,
  } = context;
  const failResult = await handleModuleFail(status, 'buster', deps.extractAgentFailReason(status, 'buster'), {
    recalledMemoryIds,
    dispatch_id: completionIdentity.dispatchId,
    gateway_label: completionGatewayLabel,
    session_key: terminalSessionKey,
  });
  if (!failResult._retry) return { terminal: { retry: false, result: failResult } };
  emitPipelineCheckpoint(config, 'after_failed_gate_before_retry', {
    step_type: 'module',
    step_id: moduleId,
    module_id: moduleId,
    attempt,
    dispatch_id: completionIdentity.dispatchId,
  });
  return { terminal: buildRetryResult(failResult, status) };
}

export async function handleBusterFailOrBlockedStatus(input: AnyRecord = {}) {
  const context = buildTerminalFailureContext(input);
  const { failureClass } = context;
  if (!failureClass) return handleMissingFailureClass(context);
  if (['output_file_identity_mismatch', 'output_file_missing'].includes(failureClass)) {
    return handleOutputArtifactTerminalFailure(context);
  }
  if (failureClass === 'infra_error') return handleInfraTerminalFailure(context);
  if (failureClass === 'infra_crash') {
    return context.isLastBusterAttempt
      ? exhaustCrashTerminalFailure(context)
      : retryCrashTerminalFailure(context);
  }
  if (['pretest_infra', 'pretest_config', 'pretest_code'].includes(failureClass)) {
    return handlePreTestTerminalFailure(context);
  }
  return handleNormalBusterTestFailure(context);
}
